"""Download YouTube-video's (met geluid) in de hoogst beschikbare kwaliteit.

Gebruikt yt-dlp om de beste videostream en de beste audiostream apart te
downloaden en ffmpeg om ze samen te voegen. Zo krijg je 4K/8K en
hoogwaardige audio, wat bij een kant-en-klaar bestand vaak niet kan.
"""
import shutil
from pathlib import Path

from yt_dlp import YoutubeDL

DEFAULT_DIR = Path(__file__).parent / "downloads"

# Beste video + beste audio, valt terug op het beste enkele bestand.
BEST_FORMAT = "bestvideo*+bestaudio/best"


def check_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg niet gevonden. Installeer het (bijv. 'sudo apt install ffmpeg' "
            "of 'brew install ffmpeg') - nodig om beeld en geluid samen te voegen."
        )


def download(url, output_dir=DEFAULT_DIR, audio_only=False, container="mkv",
             progress=None, playlist=False, cookies_from_browser=None):
    """Download een video en geef het pad van het eindbestand terug.

    container: 'mkv' (alle codecs, hoogste kwaliteit, geen herencodering) of
               'mp4' (breder compatibel; kan bij VP9/AV1 herencoderen naar H.264).
    progress:  optionele callback(dict) met voortgang van yt-dlp.
    """
    check_ffmpeg()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    opts = {
        "outtmpl": str(output_dir / "%(title).150B [%(id)s].%(ext)s"),
        "noplaylist": not playlist,
        "restrictfilenames": False,
        "windowsfilenames": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 10,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": 4,
    }
    if cookies_from_browser:
        opts["cookiesfrombrowser"] = (cookies_from_browser,)
    if progress:
        opts["progress_hooks"] = [progress]

    if audio_only:
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "0"}
        ]
    elif container == "mp4":
        opts["format"] = BEST_FORMAT
        opts["merge_output_format"] = "mp4"
        # Beste mp4-compatibele codec voorkeur, maar nooit lagere resolutie
        opts["format_sort"] = ["res", "vcodec:h264", "acodec:aac"]
    else:
        opts["format"] = BEST_FORMAT
        opts["merge_output_format"] = "mkv"

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if "entries" in info:  # playlist
            return [Path(ydl.prepare_filename(e)) for e in info["entries"] if e]
        path = Path(ydl.prepare_filename(info))
        if audio_only:
            path = path.with_suffix(".mp3")
        else:
            path = path.with_suffix("." + container)
        return path
