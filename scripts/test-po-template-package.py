"""Check package XML, including Excel's namespace-based compatibility rules."""
import io
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

def check_package(path):
    checked = 0
    with zipfile.ZipFile(path) as book:
        assert book.testzip() is None, 'Workbook ZIP checksum failed'
        for name in book.namelist():
            if not name.endswith('.xml'): continue
            data = book.read(name)
            declared = {}
            for _, pair in ET.iterparse(io.BytesIO(data), events=['start-ns']):
                declared[pair[0]] = pair[1]
            root = ET.fromstring(data)
            for element in root.iter():
                prefixes = element.get('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable', '').split()
                for prefix in prefixes:
                    assert prefix in declared, f'{name}: compatibility prefix {prefix!r} is not declared'
            checked += 1
    return checked

if __name__ == '__main__':
    target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'public/templates/PO Upload Template.xlsx')
    print(f'Passed package checks: {check_package(target)} XML parts, valid compatibility namespaces and ZIP checksums.')
