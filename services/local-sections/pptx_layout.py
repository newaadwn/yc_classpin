"""Native PPTX layout extraction, no filesystem extraction or network access.

Unsupported/inherited geometry is omitted, allowing caller to use image OCR.
Coordinates use nested group transforms and presentation slide order.
"""
import io
import posixpath
import zipfile
import xml.etree.ElementTree as ET

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def layout_candidates(elements, limit=4, min_gap=.035):
    """Stage 1: largest whitespace gaps; stage 2 may merge these topic proposals."""
    groups = [[e['id'] for e in elements if e['kind'] not in ('title', 'header', 'footer')]]
    groups = [g for g in groups if g]
    by_id = {e['id']: e for e in elements}
    while len(groups) < limit:
        best = None
        for gi, group in enumerate(groups):
            for axis in (0, 1):
                ordered = sorted(group, key=lambda i: by_id[i]['box'][axis])
                for k in range(1, len(ordered)):
                    gap = by_id[ordered[k]]['box'][axis] - max(by_id[i]['box'][axis+2] for i in ordered[:k])
                    if gap > min_gap and (best is None or gap > best[0]):
                        best = (gap, gi, ordered[:k], ordered[k:])
        if best is None:
            break
        _, gi, left, right = best
        groups[gi:gi+1] = [left, right]
    return groups


def xml(archive, name):
    data = archive.read(name)
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML_ENTITIES_NOT_ALLOWED')
    return ET.fromstring(data)


def extract_pptx(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or sum(i.file_size for i in infos) > 128 * 1024 * 1024:
            raise ValueError('ARCHIVE_TOO_LARGE')
        if any(i.file_size > 16 * 1024 * 1024 and i.filename.endswith('.xml') for i in infos):
            raise ValueError('XML_TOO_LARGE')
        presentation = xml(archive, 'ppt/presentation.xml')
        size = presentation.find('p:sldSz', NS)
        width, height = int(size.get('cx')), int(size.get('cy'))
        if width <= 0 or height <= 0:
            raise ValueError('INVALID_SLIDE_SIZE')
        relations = {r.get('Id'): r.get('Target') for r in xml(archive, 'ppt/_rels/presentation.xml.rels')
                     if r.get('TargetMode') != 'External'}
        pages = []
        for ref in presentation.findall('p:sldIdLst/p:sldId', NS):
            if len(pages) >= 200:
                raise ValueError('TOO_MANY_SLIDES')
            target = relations.get(ref.get('{'+NS['r']+'}id'), '')
            path = posixpath.normpath(posixpath.join('ppt', target))
            if not path.startswith('ppt/slides/'):
                raise ValueError('INVALID_SLIDE_PATH')
            root = xml(archive, path)
            elements = []

            def walk(parent, transform=(1, 1, 0, 0)):
                sx, sy, tx, ty = transform
                for node in parent:
                    kind = node.tag.rsplit('}', 1)[-1]
                    if kind not in ('sp', 'pic', 'graphicFrame', 'grpSp'):
                        continue
                    xf = node.find('p:grpSpPr/a:xfrm' if kind == 'grpSp' else 'p:spPr/a:xfrm', NS)
                    if xf is None:
                        xf = node.find('p:xfrm', NS)
                    # Rotated/flipped bounds need image-based analysis, not misleading boxes.
                    if xf is None or int(xf.get('rot', '0')) or xf.get('flipH') == '1' or xf.get('flipV') == '1':
                        continue
                    off, ext = xf.find('a:off', NS), xf.find('a:ext', NS)
                    if off is None or ext is None:
                        continue
                    x, y = int(off.get('x')), int(off.get('y'))
                    w, h = int(ext.get('cx')), int(ext.get('cy'))
                    if w <= 0 or h <= 0:
                        continue
                    if kind == 'grpSp':
                        co, ce = xf.find('a:chOff', NS), xf.find('a:chExt', NS)
                        if co is not None and ce is not None and int(ce.get('cx')) > 0 and int(ce.get('cy')) > 0:
                            gx, gy = w / int(ce.get('cx')), h / int(ce.get('cy'))
                            walk(node, (sx*gx, sy*gy, tx+sx*(x-int(co.get('x'))*gx), ty+sy*(y-int(co.get('y'))*gy)))
                        continue
                    text = ' '.join(t.text or '' for t in node.findall('.//a:t', NS)).strip()
                    if kind == 'sp' and not text:
                        continue  # decorative background must not swallow whitespace segmentation
                    label = 'image' if kind == 'pic' else 'text'
                    if node.find('.//a:tbl', NS) is not None:
                        label = 'table'
                    if any(n.tag.endswith('}chart') for n in node.iter()):
                        label = 'chart'
                    if any(n.tag.endswith('}oMath') for n in node.iter()):
                        label = 'equation'
                    placeholder = node.find('.//p:ph', NS)
                    if placeholder is not None and placeholder.get('type') in ('title', 'ctrTitle'):
                        label = 'title'
                    box = [max(0, (tx+sx*x)/width), max(0, (ty+sy*y)/height),
                           min(1, (tx+sx*(x+w))/width), min(1, (ty+sy*(y+h))/height)]
                    if box[2] > box[0] and box[3] > box[1]:
                        elements.append({'id': len(elements), 'kind': label, 'text': text[:1000], 'box': box})
                    if len(elements) > 200:
                        raise ValueError('TOO_MANY_ELEMENTS')
            tree = root.find('p:cSld/p:spTree', NS)
            if tree is not None:
                walk(tree)
            pages.append({'pageIndex': len(pages), 'width': width, 'height': height, 'elements': elements})
        return pages
