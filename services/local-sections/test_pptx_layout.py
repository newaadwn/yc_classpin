import io
import unittest
import zipfile
from pptx_layout import extract_pptx


class NativeLayoutTests(unittest.TestCase):
    def make(self, slide):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as z:
            z.writestr('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="s1"/></p:sldIdLst><p:sldSz cx="1000" cy="500"/></p:presentation>')
            z.writestr('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="s1" Target="slides/slide9.xml"/></Relationships>')
            z.writestr('ppt/slides/slide9.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>'+slide+'</p:spTree></p:cSld></p:sld>')
        return data.getvalue()

    def test_native_coordinates(self):
        shape='<p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="300" cy="200"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Pooling 이유</a:t></a:r></a:p></p:txBody></p:sp>'
        pages = extract_pptx(self.make(shape))
        self.assertEqual(pages[0]['width'], 1000)
        self.assertEqual(pages[0]['elements'][0]['box'], [.1, .2, .4, .6])
        self.assertEqual(pages[0]['elements'][0]['text'], 'Pooling 이유')
        group='<p:grpSp><p:grpSpPr><a:xfrm><a:off x="500" y="0"/><a:ext cx="500" cy="250"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="500"/></a:xfrm></p:grpSpPr>'+shape+'</p:grpSp>'
        self.assertEqual(extract_pptx(self.make(group))[0]['elements'][0]['box'], [.55,.1,.7,.3])

    def test_xml_rejection(self):
        with self.assertRaises(ValueError):
            extract_pptx(self.make('<!DOCTYPE malicious>'))


if __name__ == '__main__':
    unittest.main()
