import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from asset_cache import cache_destination
from geo_export import clip_line, clip_ring, features


class CacheTests(unittest.TestCase):
    def test_failed_or_overlapping_writes_do_not_publish_partial_files(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'image.tif'
            with self.assertRaises(OSError):
                with cache_destination(path) as interrupted:
                    interrupted.write_bytes(b'partial')
                    with cache_destination(path) as complete:
                        self.assertNotEqual(complete, interrupted)
                        complete.write_bytes(b'complete')
                    raise OSError('transfer interrupted')
            self.assertEqual(path.read_bytes(), b'complete')
            self.assertEqual(list(Path(folder).iterdir()), [path])

    def test_partial_responses_never_become_valid_cached_layers(self):
        partial = b'{"features":[],"exceededTransferLimit":true}'
        complete = {'features': [{'attributes': {'id': 1}, 'geometry': {'x': 0, 'y': 0}}]}
        rows = [({'id': 1}, {'x': 0, 'y': 0})]
        with TemporaryDirectory() as folder, patch('geo_export.get_bytes') as download:
            cache = Path(folder)
            path = cache / 'turkey-broomfield-data-Streets.json'
            download.return_value = partial
            with self.assertRaisesRegex(ValueError, 'Incomplete GIS response'):
                features('Streets', cache)
            self.assertFalse(path.exists())
            for old in (partial, b'{', b'{"features":[null]}'):
                with self.subTest(old=old):
                    path.write_bytes(old)
                    download.reset_mock()
                    download.return_value = json.dumps(complete).encode()
                    self.assertEqual(features('Streets', cache), rows)
                    self.assertEqual(features('Streets', cache), rows)
                    download.assert_called_once()


class GeometryTests(unittest.TestCase):
    def test_open_and_closed_rings_clip_to_the_same_boundary(self):
        box = (0, 10, 0, 10)
        ring = [[-1, 1], [8, 1], [8, 8], [-1, 8]]
        expected = [[0, 1], [8, 1], [8, 8], [0, 8]]
        self.assertEqual(clip_ring(ring, box), expected)
        self.assertEqual(clip_ring(ring + ring[:1], box), expected)
        self.assertEqual(clip_ring([], box), [])

    def test_roads_that_leave_and_reenter_the_extent_keep_separate_runs(self):
        path = [[2, 2], [12, 2], [12, 8], [2, 8]]
        self.assertEqual(clip_line(path, (0, 10, 0, 10)),
                         [[[2, 2], [10, 2]], [[10, 8], [2, 8]]])
