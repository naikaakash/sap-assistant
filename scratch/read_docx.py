import zipfile
import xml.etree.ElementTree as ET

def get_docx_text(path):
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    paragraph_tag = ns + 'p'
    text_tag = ns + 't'
    
    paragraphs = []
    with zipfile.ZipFile(path) as docx:
        tree = ET.parse(docx.open('word/document.xml'))
        root = tree.getroot()
        for p in root.iter(paragraph_tag):
            texts = [node.text for node in p.iter(text_tag) if node.text]
            if texts:
                paragraphs.append(''.join(texts))
    return '\n'.join(paragraphs)

try:
    text = get_docx_text('Aaloks_Sidekick_Procurement_Roadmap.docx')
    with open('scratch/roadmap.txt', 'w', encoding='utf-8') as f:
        f.write(text)
    print("SUCCESS_WRITE")
except Exception as e:
    print("ERROR:", e)
