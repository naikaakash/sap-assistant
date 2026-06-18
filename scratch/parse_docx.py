import zipfile
import xml.etree.ElementTree as ET
import os

def docx_to_txt(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            
            # Namespaces
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            text_runs = []
            for paragraph in root.findall('.//w:p', ns):
                paragraph_text = []
                for run in paragraph.findall('.//w:r', ns):
                    text = run.find('.//w:t', ns)
                    if text is not None and text.text:
                        paragraph_text.append(text.text)
                text_runs.append(''.join(paragraph_text))
            
            return '\n'.join(text_runs)
    except Exception as e:
        return f"Error: {e}"

# Search for the docx file
paths_to_check = [
    r"c:\Users\Aalok\Desktop\AI Projects\Procurement 3 Agent project\buyer-planner-action-workbench\Aaloks_Sidekick_Procurement_Roadmap.docx",
    r"c:\Users\Aalok\Desktop\AI Projects\Procurement 3 Agent project\Aaloks_Sidekick_Procurement_Roadmap.docx"
]

for p in paths_to_check:
    if os.path.exists(p):
        print(f"Found docx at: {p}")
        text = docx_to_txt(p)
        # print first 5000 characters and write to a txt file
        print("=== Word Document Text (Snippet) ===")
        print(text[:3000])
        print("====================================")
        out_path = p.replace('.docx', '_extracted.txt')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Wrote complete text to {out_path}")
        break
else:
    print("Docx file not found.")
