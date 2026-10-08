#!/usr/bin/env python3
"""Build + sign the iPhone Shortcut that pushes open reminders to the host.

v3 workflow (avoids iPhone flattening reminders to titles-only):
  1. Find Reminders where "Is Completed" is No
  2. Repeat with Each → Dictionary(title, listName, dueAt, notes, id)
  3. Repeat 3 times → POST /api/reminders/ingest?warm=1
     On ok:true → stop. Otherwise wait 20s and retry (flaky Wi‑Fi / Fly).

REMINDERS_INGEST_TOKEN is read from .env.local and embedded in the signed file
(Shortcuts has no secret storage), so the .shortcut output is secret material:
it is written 0600 and never echoed.

Usage:
  python3 scripts/macos/build-reminders-shortcut.py \
      --output ~/Desktop/"Invia promemoria al giornale.shortcut"

  # Also write a no-nest shell wrapper for the 05:55 Automation
  # (macOS «Esegui Shortcut» requires Input; shell does not):
  python3 scripts/macos/build-reminders-shortcut.py --with-memo --open

Do not install via Shortcuts Events / osascript. Double-click the Desktop file
(or `open` it) so Alessandro taps Add himself.

Automation «Invia memo a TDT» must NOT use «Esegui [Shortcut]» with Input.
Delete that automation and recreate 05:55 with action «Esegui script shell»:
  shortcuts run "Invia promemoria al giornale"
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
DEFAULT_MEMO_OUTPUT = "~/Desktop/Invia memo a TDT.shortcut"
INNER_SHORTCUT_NAME = "Invia promemoria al giornale"

# ISO-8601 with +HH:MM (XXX). Never XXXXX (+HH:MM:SS) — JS Date rejects it.
# Prefer Shortcuts built-in "ISO 8601" style; custom string is a fallback.
DUE_AT_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"

POST_ATTEMPTS = 3
POST_RETRY_WAIT_SECONDS = 20


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


def due_date_as_text(date_ref: dict, action_uuid: str) -> dict:
    """Force Due Date → string without Format Date.

    Format Date (Custom / ISO 8601) has blanked on iPhone while Priority still
    arrived; a Text action with the date magic variable stringifies via locale
    (Italian long form or ISO). Ingest parseDueAt accepts both.
    """
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": "Reminder DueAt",
            "WFTextActionText": token_string([date_ref]),
        },
    }


def format_due_at(date_ref: dict, action_uuid: str) -> dict:
    """Legacy Format Date helper — prefer due_date_as_text on iPhone."""
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": "Reminder DueAt Formatted",
            "WFDate": attachment(date_ref),
            "WFDateFormatStyle": "Custom",
            "WFTimeFormatStyle": "None",
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


def post_reminders(
    url: str,
    token: str,
    reminders_ref: dict,
    action_uuid: str,
    *,
    output_name: str = "Ingest Response",
) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": output_name,
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


def repeat_count_start(group_id: str, count: int) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.count",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 0,
            "WFRepeatCount": count,
        },
    }


def repeat_count_end(group_id: str, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.count",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 2,
        },
    }


def get_dictionary_value(
    key: str, input_ref: dict, action_uuid: str, output_name: str
) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "CustomOutputName": output_name,
            "WFDictionaryKey": key,
            "WFInput": attachment(input_ref),
        },
    }


def if_has_any_value(group_id: str, input_ref: dict) -> dict:
    """WFCondition 999 = Has Any Value (bendrucker / Shortcuts action refs)."""
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 0,
            "WFCondition": 999,
            "WFInput": attachment(input_ref),
        },
    }


def if_otherwise(group_id: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 1,
        },
    }


def if_end(group_id: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_id,
            "WFControlFlowMode": 2,
        },
    }


def delay_seconds(seconds: int, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.delay",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "WFDelayTime": seconds,
        },
    }


def exit_shortcut(action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.exit",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
        },
    }


def notify(title: str, body: str, action_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "WFNotificationActionTitle": title,
            "WFNotificationActionBody": body,
        },
    }


def build_workflow(host: str, token: str) -> dict:
    find_uuid = uid()
    group_id = uid()
    title_uuid = uid()
    list_uuid = uid()
    due_raw_uuid = uid()
    due_text_uuid = uid()
    notes_uuid = uid()
    priority_uuid = uid()
    id_text_uuid = uid()
    dict_uuid = uid()
    end_uuid = uid()
    retry_group = uid()
    retry_end_uuid = uid()
    post_uuid = uid()
    ok_uuid = uid()
    if_group = uid()
    exit_uuid = uid()
    delay_uuid = uid()
    notify_uuid = uid()

    title_name = "Reminder Title"
    list_name = "Reminder List"
    due_raw_name = "Reminder DueRaw"
    due_name = "Reminder DueAt"
    notes_name = "Reminder Notes"
    priority_name = "Reminder Priority"
    id_name = "Reminder Id"
    post_name = "Ingest Response"
    ok_name = "Ingest Ok"

    ingest_url = f"{host.rstrip('/')}/api/reminders/ingest?warm=1"
    reminders_ref = action_output(end_uuid, "Repeat Results")

    actions = [
        find_open_reminders(find_uuid),
        repeat_each_start(group_id, action_output(find_uuid, "Reminders")),
        reminder_detail("Title", title_uuid, title_name),
        reminder_detail("List", list_uuid, list_name),
        reminder_detail("Due Date", due_raw_uuid, due_raw_name),
        # Text coercion — not Format Date (blanked on iPhone builds).
        due_date_as_text(action_output(due_raw_uuid, due_raw_name), due_text_uuid),
        reminder_detail("Notes", notes_uuid, notes_name),
        reminder_detail("Priority", priority_uuid, priority_name),
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
                text_field("dueAt", [action_output(due_text_uuid, due_name)]),
                text_field("notes", [action_output(notes_uuid, notes_name)]),
                text_field(
                    "priority", [action_output(priority_uuid, priority_name)]
                ),
                text_field("id", [action_output(id_text_uuid, id_name)]),
            ],
            dict_uuid,
        ),
        repeat_each_end(group_id, end_uuid),
        # Up to 3 POSTs: success (ok key present) exits; else wait and retry.
        repeat_count_start(retry_group, POST_ATTEMPTS),
        post_reminders(
            ingest_url,
            token,
            reminders_ref,
            post_uuid,
            output_name=post_name,
        ),
        get_dictionary_value(
            "ok",
            action_output(post_uuid, post_name),
            ok_uuid,
            ok_name,
        ),
        if_has_any_value(if_group, action_output(ok_uuid, ok_name)),
        exit_shortcut(exit_uuid),
        if_otherwise(if_group),
        delay_seconds(POST_RETRY_WAIT_SECONDS, delay_uuid),
        if_end(if_group),
        repeat_count_end(retry_group, retry_end_uuid),
        notify(
            "The Daily Tailor",
            "Promemoria non inviati dopo 3 tentativi. Riprova a mano o all’apertura.",
            notify_uuid,
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
        # Empty: otherwise «Esegui questo Shortcut» from an Automation
        # (e.g. Invia memo a TDT @ 05:55) requires Input → «Scegli variabile»
        # and there is often no «Niente» on macOS. This shortcut finds
        # reminders itself and must not advertise any input types.
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


def build_memo_shell_wrapper(inner_name: str = INNER_SHORTCUT_NAME) -> dict:
    """Automation-friendly wrapper: no Input params (shell, not Run Shortcut).

    macOS Automations that use «Esegui [Shortcut]» often force an Input
    variable with no «Niente». A shell action avoids that entirely.
    """
    shell_uuid = uid()
    # Quote for zsh/bash single-quoted string (inner name has no quotes).
    script = f"shortcuts run '{inner_name}'"
    return {
        "WFQuickActionSurfaces": [],
        "WFWorkflowActions": [
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.runshellscript",
                "WFWorkflowActionParameters": {
                    "UUID": shell_uuid,
                    "Shell": "/bin/zsh",
                    "InputMode": "as arguments",
                    "Script": script,
                    "WFShellScript": script,
                    "WFShellType": "/bin/zsh",
                },
            }
        ],
        "WFWorkflowClientVersion": "9999",
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowIcon": {
            "WFWorkflowIconGlyphNumber": 59511,
            "WFWorkflowIconStartColor": 4282601983,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


def sign_workflow(workflow: dict, output: Path, mode: str) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    os.umask(0o077)
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "workflow.wflow"
        with source.open("wb") as handle:
            plistlib.dump(workflow, handle)
        subprocess.run(["plutil", "-lint", str(source)], check=True, capture_output=True)
        if output.exists():
            output.unlink()
        subprocess.run(
            [
                "shortcuts",
                "sign",
                "--mode",
                mode,
                "--input",
                str(source),
                "--output",
                str(output),
            ],
            check=True,
        )
    output.chmod(0o600)


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
    parser.add_argument(
        "--with-memo",
        action="store_true",
        help=(
            "also sign Desktop/Invia memo a TDT.shortcut as a shell wrapper "
            "(no Input — for 05:55 Automation)"
        ),
    )
    parser.add_argument(
        "--memo-output",
        default=DEFAULT_MEMO_OUTPUT,
        help="path for --with-memo wrapper .shortcut",
    )
    args = parser.parse_args()

    token = read_token(Path(args.env_file).expanduser())
    output = Path(args.output).expanduser()
    workflow = build_workflow(args.host, token)

    # Sanity: v3 must include Repeat-each + Dictionary + retry POST loop.
    action_ids = [
        a["WFWorkflowActionIdentifier"] for a in workflow["WFWorkflowActions"]
    ]
    if action_ids.count("is.workflow.actions.repeat.each") != 2:
        raise SystemExit("shortcut v3: expected Repeat with Each start+end")
    if action_ids.count("is.workflow.actions.repeat.count") != 2:
        raise SystemExit("shortcut v3: expected Repeat Count start+end (3 tries)")
    if "is.workflow.actions.dictionary" not in action_ids:
        raise SystemExit("shortcut v3: expected Dictionary action")
    if "is.workflow.actions.properties.reminders" not in action_ids:
        raise SystemExit("shortcut v3: expected Get Details of Reminders")
    if "is.workflow.actions.gettext" not in action_ids:
        raise SystemExit("shortcut v3: expected Text action for stable id")
    if "is.workflow.actions.getvalueforkey" not in action_ids:
        raise SystemExit("shortcut v3: expected Get Dictionary Value for ok")
    if "is.workflow.actions.delay" not in action_ids:
        raise SystemExit("shortcut v3: expected Wait between POST retries")
    if "is.workflow.actions.exit" not in action_ids:
        raise SystemExit("shortcut v3: expected Exit Shortcut on successful POST")
    if "is.workflow.actions.notification" not in action_ids:
        raise SystemExit("shortcut v3: expected Notification after 3 failed POSTs")
    retry_starts = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.repeat.count"
        and a["WFWorkflowActionParameters"].get("WFControlFlowMode") == 0
    ]
    if not retry_starts or retry_starts[0]["WFWorkflowActionParameters"].get(
        "WFRepeatCount"
    ) != POST_ATTEMPTS:
        raise SystemExit(
            f"shortcut v3: expected WFRepeatCount={POST_ATTEMPTS} on retry loop"
        )
    due_text_actions = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext"
        and a["WFWorkflowActionParameters"].get("CustomOutputName")
        == "Reminder DueAt"
    ]
    if not due_text_actions:
        raise SystemExit(
            "shortcut v3: expected Text action 'Reminder DueAt' "
            "(coerce Due Date to string; do not use Format Date alone)"
        )
    reminder_props: set[str] = set()
    for action in workflow["WFWorkflowActions"]:
        if action["WFWorkflowActionIdentifier"] != (
            "is.workflow.actions.properties.reminders"
        ):
            continue
        prop = action["WFWorkflowActionParameters"].get("WFContentItemPropertyName")
        if prop == "Identifier":
            raise SystemExit(
                "shortcut v3: do not use Reminder Identifier detail "
                "(Italian UI binds it to Elenco)"
            )
        if isinstance(prop, str):
            reminder_props.add(prop)
    for required in ("Title", "List", "Due Date", "Notes", "Priority"):
        if required not in reminder_props:
            raise SystemExit(f"shortcut v3: missing Reminder detail {required!r}")
    for action in workflow["WFWorkflowActions"]:
        if action["WFWorkflowActionIdentifier"] != "is.workflow.actions.format.date":
            continue
        fmt = action["WFWorkflowActionParameters"].get("WFDateFormatString")
        if isinstance(fmt, str) and "XXXXX" in fmt:
            raise SystemExit(
                "shortcut v3: dueAt format must use XXX (+HH:MM), "
                "not XXXXX (+HH:MM:SS) — JS Date rejects the latter"
            )
        style = action["WFWorkflowActionParameters"].get("WFTimeFormatStyle")
        if style == "Custom":
            raise SystemExit(
                "shortcut v3: WFTimeFormatStyle=Custom blanks dueAt on iPhone"
            )

    sign_workflow(workflow, output, args.mode)
    print(f"Shortcut v3 firmato: {output}")
    print(f"POST ingest: fino a {POST_ATTEMPTS} tentativi, attesa {POST_RETRY_WAIT_SECONDS}s.")
    print("Contiene il token: trattalo come materiale segreto.")
    print("Non usare Automation/Shortcuts Events: doppio click sul file → Aggiungi.")

    memo_output: Path | None = None
    if args.with_memo:
        memo_output = Path(args.memo_output).expanduser()
        sign_workflow(build_memo_shell_wrapper(), memo_output, args.mode)
        print(f"Memo wrapper (shell, no Input): {memo_output}")
        print(
            "Automazione 05:55: elimina quella rotta → nuova → "
            'Esegui script shell → shortcuts run '
            f"'{INNER_SHORTCUT_NAME}'"
        )

    if args.open:
        subprocess.run(["open", str(output)], check=False)
        if memo_output is not None:
            subprocess.run(["open", str(memo_output)], check=False)


if __name__ == "__main__":
    main()
