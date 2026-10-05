#!/usr/bin/env python3
"""Build demo/standalone.html: a single self-contained file that runs from
file:// (double-click) with three.js, the scene, and robot.vrm all embedded.

Run from anywhere:  python3 demo/build-standalone.py
"""
import base64, pathlib

D = pathlib.Path(__file__).resolve().parent

def read(p):
    # neutralise any literal </script> so inlining can't close the tag early
    return (D / p).read_text().replace("</script", "<\\/script")

three = read("vendor/three.min.js")
gltf  = read("vendor/GLTFLoader.js")
room  = read("vendor/RoomEnvironment.js")
scene = read("scene.js")
b64   = base64.b64encode((D / "robot.vrm").read_bytes()).decode("ascii")

html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#05060a">
<link rel="icon" href="data:,">
<title>Robot Walk — Spaceship (standalone)</title>
</head>
<body>
<script>%s</script>
<script>%s</script>
<script>%s</script>
<script id="model" type="application/octet-stream">%s</script>
<script>window.ROBOT_B64 = document.getElementById('model').textContent.trim();</script>
<script>%s</script>
</body>
</html>
""" % (three, gltf, room, b64, scene)

out = D / "standalone.html"
out.write_text(html)
print("wrote %s (%.1f MB)" % (out, out.stat().st_size / 1e6))
