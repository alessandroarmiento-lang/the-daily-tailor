#!/usr/bin/env python3
"""Build + sign the iPhone Shortcut that pushes open reminders to the host.

The shortcut has two actions:
  1. Find Reminders where "Is Completed" is No
  2. Get Contents of URL — POST the reminders to /api/reminders/ingest

The edition rebuild is not triggered here: the host already warms at 06:00
(deploy/fly/crontab), five minutes after the 05:55 automation.

REMINDERS_INGEST_TOKEN is read from .env.local and embedded in the signed file
(Shortcuts has no secret storage), so the .shortcut output is secret material:
it is written 0600 and never echoed.

Usage:
  python3 scripts/macos/build-reminders-shortcut.py \
      --output ~/Desktop/"Invia promemoria al giornale.shortcut"
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
    actions = [
        find_open_reminders(find_uuid),
        post_reminders(
            f"{host.rstrip('/')}/api/reminders/ingest",
            token,
            action_output(find_uuid, "Reminders"),
            uid(),
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
    args = parser.parse_args()

    token = read_token(Path(args.env_file).expanduser())
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)

    os.umask(0o077)
    # `shortcuts sign` only accepts .wflow / .shortcut input, never .plist.
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "reminders.wflow"
        with source.open("wb") as handle:
            plistlib.dump(build_workflow(args.host, token), handle)
        subprocess.run(["plutil", "-lint", str(source)], check=True, capture_output=True)
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
    print(f"Shortcut firmato: {output}")
    print("Contiene il token: trattalo come materiale segreto.")


if __name__ == "__main__":
    main()
