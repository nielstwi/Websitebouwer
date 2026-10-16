# YouTube Downloader

Downloadt YouTube-video's **met geluid** in de **hoogst beschikbare kwaliteit**
(beste videostream + beste audiostream, samengevoegd met ffmpeg).

## Installatie
```
pip install -r requirements.txt
# ffmpeg is ook nodig: sudo apt install ffmpeg  /  brew install ffmpeg
```

## Gebruik
Command line:
```
python cli.py "https://www.youtube.com/watch?v=..."          # MKV, hoogste kwaliteit
python cli.py "<url>" --mp4                                   # MP4 (breder compatibel)
python cli.py "<url>" --audio                                 # alleen MP3
python cli.py "<playlist-url>" --playlist -o ~/Videos
```
Webinterface (alleen lokaal): `python server.py` en open http://127.0.0.1:8000

Bestanden komen standaard in `downloads/`.

## Problemen
Krijg je "Sign in to confirm you're not a bot"? Log in op YouTube in je browser en run:
`python cli.py "<url>" --cookies-from-browser chrome`

## Tips
- MKV behoudt de originele streams (4K/8K, VP9/AV1, Opus) zonder kwaliteitsverlies.
- Houd yt-dlp up-to-date (`pip install -U yt-dlp`); YouTube verandert vaak.
- Download alleen content waarvoor je toestemming hebt (eigen video's, Creative
  Commons, of persoonlijk gebruik waar de wet dat toestaat). Dit gaat tegen de
  gebruiksvoorwaarden van YouTube in voor content van anderen.
