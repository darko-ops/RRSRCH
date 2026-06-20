from __future__ import annotations

import numpy as np

from rrsrch.embedder import HashEmbedder, cosine


def test_deterministic_and_normalized():
    e = HashEmbedder(dim=384)
    a = e.encode(["CMMC Level 2 assessment requirements"])
    b = e.encode(["CMMC Level 2 assessment requirements"])
    assert np.allclose(a, b)                          # deterministic
    assert abs(np.linalg.norm(a[0]) - 1.0) < 1e-5     # unit length


def test_paraphrase_is_closer_than_unrelated():
    e = HashEmbedder(dim=384)
    v = e.encode([
        "CMMC Level 2 assessment requirements",                 # 0 original
        "what does CMMC level 2 require for assessment?",        # 1 paraphrase
        "current AWS S3 storage price per GB",                   # 2 unrelated
    ])
    near = cosine(v[0], v[1])
    far = cosine(v[0], v[2])
    assert near > far
    assert near > 0.5  # paraphrase clears the offline floor (see DECISIONS / config)


def test_empty_input():
    e = HashEmbedder(dim=16)
    assert e.encode([]).shape == (0, 16)
