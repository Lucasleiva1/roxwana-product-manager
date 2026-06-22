import argparse
import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="es")
    parser.add_argument("--prompt", default="")
    args = parser.parse_args()

    try:
        import torch

        use_cuda = bool(torch.cuda.is_available())
    except Exception:
        use_cuda = False

    model_root = os.path.join(
        os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
        "ScribeFloat",
        "models",
    )
    whisper = WhisperModel(
        args.model,
        device="cuda" if use_cuda else "cpu",
        compute_type="float16" if use_cuda else "int8",
        download_root=model_root,
    )
    segments, info = whisper.transcribe(
        args.audio,
        language=args.language or None,
        beam_size=1,
        vad_filter=True,
        initial_prompt=args.prompt[-500:] or None,
    )
    text = " ".join(segment.text.strip() for segment in segments).strip()
    print(
        json.dumps(
            {"text": text, "language": getattr(info, "language", args.language)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)
