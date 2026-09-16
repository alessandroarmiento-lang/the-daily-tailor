#!/usr/bin/env python3
"""Build + sign the iPhone Shortcut that pushes open reminders to the host.

v2 workflow (avoids iPhone flattening reminders to titles-only):
  1. Find Reminders where "Is Completed" is No
  2. Repeat with Each → Dictionary(title, listName, dueAt, notes, id)
  3. Get Contents of URL — POST the dictionary list to /api/reminders/ingest

The edition rebuild is not triggered here: the host already warms at 06:00
(deploy/fly/crontab), five minutes after the 05:55 automation.

REMINDERS_INGEST_TOKEN is read from .env.local and embedded in the signed file
(Shortcuts has no secret storage), so the .shortcut output is secret material:
it is written 0600 and never echoed.

Usage:
  python3 scripts/macos/build-reminders-shortcut.py \
      --output ~/Desktop/"Invia promemoria al giornale.shortcut"

Do not install via Shortcuts Events / osascript. Double-click the Desktop file
(or `open` it) so Alessandro taps Add himself.
"""
from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import tempfile
import uuid
from pathlib import Path

# Object replacement character: marks where a variable sits inside a text token.
FFFC = "\ufffc"

DEFAULT_HOST = "https://the-daily-tailor.fly.dev"
DEFAULT_OUTPUT = "~/Desktop/Invia promemoria al giornale.shortcut"

# ISO-8601-ish; ingest-store accepts this and Italian gg/mm/aaaa text.
DUE_AT_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXXXX"


def read_token(env_file: Path) -> str:
    env_token = (os.environ.get("REMINDERS_INGEST_TOKEN") or "").strip()
    if env_token:
        return env_token
    if not env_file.is_file():
        raise SystemExit(f"{env_file} mancante e REMINDERS_INGEST_TOKEN non nell'ambiente")
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or not stripped.startswith("REMINDERS_INGEST_TOKEN="):
            continue
        value = stripped.partition("=")[2].strip().strip('"').strip("'")
        if value:
            return value
    raise SystemExit(f"REMINDERS_INGEST_TOKEN assente in {env_file}")


def uid() -> str:
    return str(uuid.uuid4()).upper()


def token_string(parts: list) -> dict:
    """WFTextTokenString: plain strings plus inline variable attachments."""
    text = ""
    attachments: dict[str, dict] = {}
    for part in parts:
        if isinstance(part, str):
            text += part
        else:
            attachments[f"{{{len(text)}, 1}}"] = part
            text += FFFC
    value: dict = {"string": text}
    if attachments:
        value["attachmentsByRange"] = attachments
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def action_output(action_uuid: str, name: str) -> dict:
    return {"OutputName": name, "OutputUUID": action_uuid, "Type": "ActionOutput"}


def attachment(ref: dict) -> dict:
    return {"Value": ref, "WFSerializationType": "WFTextTokenAttachment"}


def repeat_item_ref() -> dict:
    """Current reminder inside Repeat with Each."""
    return {"Type": "Variable", "VariableName": "Repeat Item"}


def dictionary_field(items: list) -> dict:
    return {
        "Value": {"WFDictionaryFieldValueItems": items},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def text_field(key: str, value_parts: list) -> dict:
    return {
        "WFItemType": 0,
        "WFKey": token_string([key]),
        "WFValue": token_string(value_parts),
    }


def find_open_reminders(action_uuid: str) -> dict:
    """Serialization mirrors Apple's own MorningReport.wflow gallery shortcut."""
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.reminders",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "WFContentItemFilter": {
                "Value": {
                    "WFActionParameterFilterPrefix": 1,
                    "WFActionParameterFilterTemplates": [
                        {
                            "Operator": 4,
                            "Property": "Is Completed",
                            "Removable": True,
                            "Values": {"Bool": False},
                        }
                    ],
                    "WFContentPredicateBoundedDate": False,
                },
                "WFSerializationType": "WFContentPredicateTableTemplate",
            },
        },
    }


def repeat_each_start(group_id: str, input_ref: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 0,
            "WFInput": attachment(input_ref),
        },
    }


def repeat_each_end(group_id: str, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 2,
        },
    }


def reminder_detail(
    property_name: str, action_uuid: str, output_name: str
) -> dict:
    """Get Details of Reminders for the current Repeat Item.

    Each call needs a distinct CustomOutputName: Italian Shortcuts otherwise
    collapses every "Details of Reminders" and the Dictionary can bind `id`
    to Elenco (List) by mistake. There is no reliable Identifier property on
    Reminder content items — do not request one.
    """
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.properties.reminders",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": output_name,
            "WFContentItemPropertyName": property_name,
            "WFInput": attachment(repeat_item_ref()),
        },
    }


def format_due_at(date_ref: dict, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": "Reminder DueAt",
            "WFDate": attachment(date_ref),
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": "Custom",
            "WFDateFormatString": DUE_AT_FORMAT,
        },
    }


def stable_id_text(
    list_ref: dict, title_ref: dict, action_uuid: str
) -> dict:
    """Stable push id = listName|title (host synthesizes the same when id missing)."""
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": "Reminder Id",
            "WFTextActionText": token_string([list_ref, "|", title_ref]),
        },
    }


def dictionary_action(fields: list, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.dictionary",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": "Reminder Dict",
            "WFItems": dictionary_field(fields),
        },
    }


def post_reminders(url: str, token: str, reminders_ref: dict, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "Advanced": True,
            "ShowHeaders": True,
            "WFHTTPMethod": "POST",
            "WFURL": token_string([url]),
            "WFHTTPHeaders": dictionary_field(
                [
                    text_field("Content-Type", ["application/json"]),
                    text_field("X-Ingest-Token", [token]),
                ]
            ),
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": dictionary_field(
                [
                    text_field("device", ["iPhone"]),
                    text_field("reminders", [reminders_ref]),
                ]
            ),
        },
    }


def build_workflow(host: str, token: str) -> dict:
    find_uuid = uid()
    group_id = uid()
    title_uuid = uid()
    list_uuid = uid()
    due_raw_uuid = uid()
    due_fmt_uuid = uid()
    notes_uuid = uid()
    id_text_uuid = uid()
    dict_uuid = uid()
    end_uuid = uid()
    post_uuid = uid()

    title_name = "Reminder Title"
    list_name = "Reminder List"
    due_raw_name = "Reminder DueRaw"
    due_name = "Reminder DueAt"
    notes_name = "Reminder Notes"
    id_name = "Reminder Id"

    actions = [
        find_open_reminders(find_uuid),
        repeat_each_start(group_id, action_output(find_uuid, "Reminders")),
        reminder_detail("Title", title_uuid, title_name),
        reminder_detail("List", list_uuid, list_name),
        reminder_detail("Due Date", due_raw_uuid, due_raw_name),
        format_due_at(action_output(due_raw_uuid, due_raw_name), due_fmt_uuid),
        reminder_detail("Notes", notes_uuid, notes_name),
        # No Identifier property in Shortcuts Reminder details — Italian UI was
        # binding Dictionary.id to Elenco (List). Stable key instead.
        stable_id_text(
            action_output(list_uuid, list_name),
            action_output(title_uuid, title_name),
            id_text_uuid,
        ),
        dictionary_action(
            [
                text_field("title", [action_output(title_uuid, title_name)]),
                text_field("listName", [action_output(list_uuid, list_name)]),
                text_field("dueAt", [action_output(due_fmt_uuid, due_name)]),
                text_field("notes", [action_output(notes_uuid, notes_name)]),
                text_field("id", [action_output(id_text_uuid, id_name)]),
            ],
            dict_uuid,
        ),
        repeat_each_end(group_id, end_uuid),
        post_reminders(
            f"{host.rstrip('/')}/api/reminders/ingest",
            token,
            action_output(end_uuid, "Repeat Results"),
            post_uuid,
        ),
    ]
    return {
        "WFQuickActionSurfaces": [],
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "9999",
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowIcon": {
            "WFWorkflowIconGlyphNumber": 59511,
            "WFWorkflowIconStartColor": 4292093695,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": [
            "WFAppContentItem",
            "WFAppStoreAppContentItem",
            "WFArticleContentItem",
            "WFContactContentItem",
            "WFDateContentItem",
            "WFEmailAddressContentItem",
            "WFFolderContentItem",
            "WFGenericFileContentItem",
            "WFImageContentItem",
            "WFiTunesProductContentItem",
            "WFLocationContentItem",
            "WFDCMapsLinkContentItem",
            "WFAVAssetContentItem",
            "WFPDFContentItem",
            "WFPhoneNumberContentItem",
            "WFRichTextContentItem",
            "WFSafariWebPageContentItem",
            "WFStringContentItem",
            "WFURLContentItem",
        ],
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=str(repo_root / ".env.local"))
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--mode",
        default="anyone",
        choices=["anyone", "people-who-know-me"],
        help="shortcuts sign mode",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="open the signed .shortcut so the user can tap Add (no CLI install)",
    )
    args = parser.parse_args()

    token = read_token(Path(args.env_file).expanduser())
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)

    os.umask(0o077)
    # `shortcuts sign` only accepts .wflow / .shortcut input, never .plist.
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "reminders.wflow"
        workflow = build_workflow(args.host, token)
        with source.open("wb") as handle:
            plistlib.dump(workflow, handle)
        subprocess.run(["plutil", "-lint", str(source)], check=True, capture_output=True)

        # Sanity: v2 must include the Repeat + Dictionary path (not raw Reminders POST).
        action_ids = [
            a["WFWorkflowActionIdentifier"] for a in workflow["WFWorkflowActions"]
        ]
        if action_ids.count("is.workflow.actions.repeat.each") != 2:
            raise SystemExit("shortcut v2: expected Repeat with Each start+end")
        if "is.workflow.actions.dictionary" not in action_ids:
            raise SystemExit("shortcut v2: expected Dictionary action")
        if "is.workflow.actions.properties.reminders" not in action_ids:
            raise SystemExit("shortcut v2: expected Get Details of Reminders")
        if "is.workflow.actions.gettext" not in action_ids:
            raise SystemExit("shortcut v2: expected Text action for stable id")
        # Guard: invalid "Identifier" detail remaps to Elenco on Italian iOS.
        for action in workflow["WFWorkflowActions"]:
            if action["WFWorkflowActionIdentifier"] != (
                "is.workflow.actions.properties.reminders"
            ):
                continue
            prop = action["WFWorkflowActionParameters"].get(
                "WFContentItemPropertyName"
            )
            if prop == "Identifier":
                raise SystemExit(
                    "shortcut v2: do not use Reminder Identifier detail "
                    "(Italian UI binds it to Elenco)"
                )

        if output.exists():
            output.unlink()
        subprocess.run(
            [
                "shortcuts",
                "sign",
                "--mode",
                args.mode,
                "--input",
                str(source),
                "--output",
                str(output),
            ],
            check=True,
        )
    output.chmod(0o600)
    print(f"Shortcut v2 firmato: {output}")
    print("Contiene il token: trattalo come materiale segreto.")
    print("Non usare Automation/Shortcuts Events: doppio click sul file → Aggiungi.")
    if args.open:
        subprocess.run(["open", str(output)], check=False)


if __name__ == "__main__":
    main()
