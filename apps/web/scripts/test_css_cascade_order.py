import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('css_cascade', Path(__file__).with_name('check-css-cascade-order.py'))
cascade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cascade)


class BundleOrderTest(unittest.TestCase):
    def test_origin_snapshot_detects_reversed_rules_without_git_history(self):
        first = ('.same', 'color:white')
        second = ('.same', 'color:black')
        snapshot = {
            'schema': 1,
            'fingerprint': 'sha256(selector+NUL+body)',
            'apps': {'desktop': {
                cascade.rule_fingerprint(*first): 0,
                cascade.rule_fingerprint(*second): 1,
            }},
        }
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / 'origin.json'
            fixture.write_text(json.dumps(snapshot), encoding='utf-8')
            with patch.object(cascade, 'ORIGIN_SNAPSHOT', fixture):
                config = {'app': 'desktop', 'shell': 'desktop.css'}
                self.assertEqual(cascade.check_origin_order(config, [first, second], []), [])
                problems = cascade.check_origin_order(config, [second, first], [])
                self.assertEqual(len(problems), 1)
                self.assertIn('REVERSED', problems[0])

    def test_html_stylesheets_precede_lazy_chunks_and_reversed_order_still_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / 'assets'
            assets.mkdir()
            shell = assets / 'z-shell.css'
            component = assets / 'm-component.css'
            lazy = assets / 'a-lazy.css'
            shell.write_text('.shell{color:white}', encoding='utf-8')
            component.write_text('.component{color:blue}', encoding='utf-8')
            lazy.write_text('.lazy{color:green}', encoding='utf-8')
            entry = root / 'desktop.html'
            entry.write_text('<link rel="stylesheet" href="/web/assets/z-shell.css?v=1">'
                             '<link href="/web/assets/m-component.css" rel="stylesheet">', encoding='utf-8')
            config = {'dist': directory, 'html': 'desktop.html'}
            bundle = cascade.load_bundle(config)
            self.assertEqual(bundle, shell.read_text() + component.read_text() + lazy.read_text())
            self.assertEqual(cascade.check_bundle_order(config, bundle, [('.shell', 'color:white')], [component, lazy]), [])

            entry.write_text('<link rel="stylesheet" href="/web/assets/m-component.css">'
                             '<link rel="stylesheet" href="/web/assets/z-shell.css">', encoding='utf-8')
            problems = cascade.check_bundle_order(config, cascade.load_bundle(config), [('.shell', 'color:white')], [component, lazy])
            self.assertEqual(len(problems), 1)
            self.assertIn('BUNDLE m-component.css', problems[0])


if __name__ == '__main__':
    unittest.main()
