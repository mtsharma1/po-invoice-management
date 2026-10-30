"""Repair missing namespace declarations without rewriting workbook cells."""
import io
import pathlib
import re
import sys
import runpy
import zipfile
import xml.etree.ElementTree as ET
check_package = runpy.run_path(str(pathlib.Path(__file__).with_name('test-po-template-package.py')))['check_package']

NAMESPACES = {
    'x14ac': 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac',
    'xr': 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision',
    'xr2': 'http://schemas.microsoft.com/office/spreadsheetml/2015/revision2',
    'xr3': 'http://schemas.microsoft.com/office/spreadsheetml/2016/revision3',
}

def repair_xml(data):
    declared = {pair[0]: pair[1] for _, pair in ET.iterparse(io.BytesIO(data), events=['start-ns'])}
    root = ET.fromstring(data)
    prefixes = root.get('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable', '').split()
    missing = [prefix for prefix in prefixes if prefix not in declared]
    if not missing: return data
    unknown = [prefix for prefix in missing if prefix not in NAMESPACES]
    if unknown: raise ValueError(f'Unknown compatibility namespaces: {unknown}')
    declarations = ''.join(f' xmlns:{prefix}="{NAMESPACES[prefix]}"' for prefix in missing)
    text = data.decode('utf-8')
    return re.sub(r'(<(?:[\w]+:)?[\w]+\b[^>]*)(>)', lambda m: m[1] + declarations + m[2], text, count=1).encode('utf-8')

def repair_package(target):
    target = pathlib.Path(target)
    temp = target.with_suffix('.namespace-fix.xlsx')
    changed = []
    with zipfile.ZipFile(target) as original, zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as fixed:
        for part in original.infolist():
            data = original.read(part.filename)
            repaired = repair_xml(data) if part.filename.endswith('.xml') else data
            if repaired != data:
                assert ET.tostring(ET.fromstring(repaired)) == ET.tostring(ET.fromstring(data)), 'Cell content changed'
                changed.append(part.filename)
            fixed.writestr(part, repaired)
    check_package(temp)
    temp.replace(target)
    return changed

if __name__ == '__main__':
    print('Repaired namespace declarations:', repair_package(sys.argv[1] if len(sys.argv)>1 else 'public/templates/PO Upload Template.xlsx'))
