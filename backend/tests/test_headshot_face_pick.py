"""Which Haar detection becomes the headshot (#187).

The boxes below are the real detections from the S37 cast photos that broke
both ways — a torso beating the face on area, and a bystander beating the face
on height.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from load_headshots import pick_face  # noqa: E402


def test_torso_does_not_beat_the_face_on_area():
    """Natalia: the midriff detection is bigger, the face is higher."""
    face, torso = (201, 53, 58, 58), (138, 224, 67, 67)
    assert tuple(pick_face([face, torso], 600)) == face


def test_bystander_does_not_beat_the_face_on_height():
    """Mike White: a small background face sits above a close-up portrait."""
    face, bystander = (310, 417, 907, 907), (51, 164, 189, 189)
    assert tuple(pick_face([face, bystander], 2400)) == face


def test_detections_below_the_frame_top_are_discarded():
    assert pick_face([(338, 785, 151, 151)], 1200) is None
