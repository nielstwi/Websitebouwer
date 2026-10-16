#!/usr/bin/env python3
"""Gebruik: python cli.py <url> [--mp4] [--audio] [-o map]"""
import argparse
import sys

from downloader import DEFAULT_DIR, download


def hook(d):
    if d["status"] == "downloading":
        pct = d.get("_percent_str", "").strip()
        speed = d.get("_speed_str", "").strip()
        print(f"\r{pct} {speed}   ", end="", flush=True)
    elif d["status"] == "finished":
        print("\nSamenvoegen/verwerken...")


def main():
    p = argparse.ArgumentParser(description="Download YouTube-video's in de hoogste kwaliteit.")
    p.add_argument("url", nargs="+")
    p.add_argument("--mp4", action="store_true", help="mp4 i.p.v. mkv (breder compatibel)")
    p.add_argument("--audio", action="store_true", help="alleen audio (mp3)")
    p.add_argument("--playlist", action="store_true", help="hele playlist downloaden")
    p.add_argument("--cookies-from-browser", metavar="BROWSER",
                   help="gebruik cookies van chrome/firefox/edge (bij bot-melding van YouTube)")
    p.add_argument("-o", "--output", default=str(DEFAULT_DIR), help="doelmap")
    a = p.parse_args()
    for url in a.url:
        try:
            res = download(url, a.output, a.audio, "mp4" if a.mp4 else "mkv", hook, a.playlist,
                           a.cookies_from_browser)
            print(f"Klaar: {res}")
        except Exception as e:
            print(f"Fout bij {url}: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
