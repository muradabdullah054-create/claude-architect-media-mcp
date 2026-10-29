#!/usr/bin/env python3
"""
render.py — Renders the 36-second Elfarida reel (1080x1920, 30 fps) with Playwright Chromium & FFmpeg:
  1. Saves 6 QA test stills to qa/ before full render.
  2. Renders in six 6-second chunks to out/chunks/, skipping any chunk already completed.
  3. Mixes voiceover.mp3 (delayed 0.2s) with audio/score.wav (sidechain ducked, loudnorm -14 LUFS).
  4. Concatenates chunks and muxes audio into out/final.mp4 (H.264 + AAC).

  python render.py            full render
  python render.py --qa-only  QA stills only
"""
import os
import re
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION = 36.0
CHUNK_SECONDS = 6.0

CHROMIUM_ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
    "--no-sandbox",
]

# 6 key moments across the 36-second timeline for QA verification (video time)
QA_STILLS = [
    (2.6, "01_survey_pooling.jpg"),
    (7.0, "02_slope_tilt_impact.jpg"),
    (12.2, "03_glass_tiles_wrong_slope.jpg"),
    (20.5, "04_specialist_laser_solution.jpg"),
    (27.3, "05_flashback_tiles_pop.jpg"),
    (32.0, "06_exploded_layers_under_tile.jpg"),
]


def detect_silences(vo_path: Path):
    if not vo_path.exists():
        return []
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(vo_path),
        "-af", "silencedetect=n=-30dB:d=0.12", "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, check=False)
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", proc.stderr)]
    return list(zip(starts, ends))


def is_chunk_valid(chunk_path: Path, expected_duration: float) -> bool:
    if not chunk_path.exists() or chunk_path.stat().st_size < 10000:
        return False
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(chunk_path)
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    try:
        dur = float(proc.stdout.strip())
        return abs(dur - expected_duration) < 0.25
    except ValueError:
        return False


def render_qa_stills(page, qa_dir: Path):
    qa_dir.mkdir(parents=True, exist_ok=True)
    print("\n--- Saving 6 QA Test Stills to qa/ ---")
    for t, filename in QA_STILLS:
        page.evaluate(f"window.render({t:.4f})")
        still_path = qa_dir / filename
        page.screenshot(path=str(still_path), type="jpeg", quality=92)
        print(f"  [QA] Saved {still_path} (t = {t:.1f}s)")


def render_chunk(page, chunk_idx: int, t_start: float, t_end: float, chunk_path: Path):
    start_frame = int(round(t_start * FPS))
    end_frame = int(round(t_end * FPS))
    total_frames = end_frame - start_frame
    temp_path = chunk_path.with_suffix(".part.mp4")

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-r", str(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        "-preset", "medium",
        "-movflags", "+faststart",
        str(temp_path)
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for idx, f in enumerate(range(start_frame, end_frame)):
            t = f / float(FPS)
            page.evaluate(f"window.render({t:.6f})")
            jpg_bytes = page.screenshot(type="jpeg", quality=95)
            proc.stdin.write(jpg_bytes)
            if (idx + 1) % 30 == 0 or (idx + 1) == total_frames:
                print(f"    Chunk {chunk_idx + 1}: frame {idx + 1}/{total_frames} (t={t:.2f}s)", flush=True)
        proc.stdin.close()
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg exited with code {proc.returncode} on chunk {chunk_idx}")
        if chunk_path.exists():
            chunk_path.unlink()
        temp_path.rename(chunk_path)
    finally:
        if proc.stdin and not proc.stdin.closed:
            proc.stdin.close()


def mix_audio(score_wav: Path, vo_mp3: Path, out_mix_wav: Path):
    out_mix_wav.parent.mkdir(parents=True, exist_ok=True)
    if vo_mp3.exists():
        print("\n--- Mixing voiceover.mp3 (+0.2s delay) with audio/score.wav (-14 LUFS) ---")
        filter_complex = (
            "[1:a]adelay=200|200,highpass=f=80,"
            "acompressor=threshold=-18dB:ratio=2.5:attack=10:release=120:makeup=2,"
            "aresample=48000,aformat=channel_layouts=stereo,"
            "apad=whole_dur=36.0,atrim=0:36.0,asplit=2[vo_sc][vo_mix];"
            "[0:a]atrim=0:36.0[bg_trim];"
            "[bg_trim][vo_sc]sidechaincompress=threshold=0.025:ratio=5:attack=15:release=260[bg_ducked];"
            "[bg_ducked][vo_mix]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
            "loudnorm=I=-14:TP=-1.5:LRA=11[out]"
        )
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(score_wav),
            "-i", str(vo_mp3),
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-ar", "48000",
            "-ac", "2",
            str(out_mix_wav)
        ]
    else:
        print("\n--- voiceover.mp3 not found; normalizing audio/score.wav (-14 LUFS) ---")
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(score_wav),
            "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-ar", "48000",
            "-ac", "2",
            str(out_mix_wav)
        ]
    subprocess.run(cmd, check=True)
    print(f"  [Audio] Mixed master audio -> {out_mix_wav}")


def main():
    qa_only = "--qa-only" in sys.argv[1:]
    root_dir = Path(__file__).resolve().parent
    html_path = root_dir / "index.html"
    qa_dir = root_dir / "qa"
    out_dir = root_dir / "out"
    chunks_dir = out_dir / "chunks"
    score_wav = root_dir / "audio" / "score.wav"
    mix_wav = root_dir / "audio" / "mix.wav"
    vo_mp3 = root_dir / "voiceover.mp3"
    final_mp4 = out_dir / "final.mp4"

    out_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    silences = detect_silences(vo_mp3)
    if silences:
        print(f"[VO] Detected {len(silences)} silence intervals in voiceover.mp3 (-30dB, d=0.12)")

    with sync_playwright() as p:
        # CHROMIUM_PATH lets a machine with its own Chromium skip `playwright install`
        browser = p.chromium.launch(
            headless=True, args=CHROMIUM_ARGS, executable_path=os.environ.get("CHROMIUM_PATH") or None
        )
        context = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1
        )
        page = context.new_page()
        page.goto(html_path.as_uri(), wait_until="networkidle")
        page.wait_for_function("window.__ready === true", timeout=20000)

        # 1. Save 6 QA test stills first
        render_qa_stills(page, qa_dir)
        if qa_only:
            browser.close()
            return

        # 2. Render in 6-second chunks (6 chunks = 36s), skipping finished chunks
        print("\n--- Rendering 36s Video in 6-Second Chunks ---")
        n_chunks = int(round(DURATION / CHUNK_SECONDS))
        chunk_files = []
        for i in range(n_chunks):
            c_start = i * CHUNK_SECONDS
            c_end = min(DURATION, (i + 1) * CHUNK_SECONDS)
            c_file = chunks_dir / f"chunk_{i:02d}.mp4"
            chunk_files.append(c_file)

            if is_chunk_valid(c_file, c_end - c_start):
                print(f"  [Skip] Chunk {i + 1}/{n_chunks} ({c_start:.1f}s - {c_end:.1f}s) already finished.")
                continue

            print(f"  [Render] Chunk {i + 1}/{n_chunks} ({c_start:.1f}s - {c_end:.1f}s) -> {c_file.name}")
            render_chunk(page, i, c_start, c_end, c_file)

        browser.close()

    # 3. Mix VO + Score
    if not score_wav.exists():
        subprocess.run([sys.executable, str(root_dir / "audio" / "make_audio.py")], check=True)
    mix_audio(score_wav, vo_mp3, mix_wav)

    # 4. Concatenate chunks and mux audio into out/final.mp4
    concat_txt = chunks_dir / "concat.txt"
    with open(concat_txt, "w", encoding="utf-8") as f:
        for cf in chunk_files:
            f.write(f"file '{cf.resolve().as_posix()}'\n")

    print("\n--- Concatenating Chunks & Muxing Audio to out/final.mp4 ---")
    mux_cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", str(concat_txt),
        "-i", str(mix_wav),
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(final_mp4)
    ]
    subprocess.run(mux_cmd, check=True)
    print(f"\n[SUCCESS] Final reel ready -> {final_mp4} (1080x1920, 30 fps, 36s, H.264 + AAC)")


if __name__ == "__main__":
    main()
