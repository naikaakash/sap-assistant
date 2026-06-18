import re

def rename_ctb():
    file_path = 'app/page.tsx'
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    print("Initial file size:", len(content))
    
    # Precise terminology renaming mapping
    replacements = {
        "Clear-to-Build": "Material Availability",
        "Clear-to-build": "Material availability",
        "Clear to Build": "Material Availability",
        "Clear to build": "Material availability",
        "CTB < 100%": "Availability < 100%",
        "Average CTB %": "Average Availability %",
        "Avg CTB %": "Avg Availability %",
        "CTB snapshots": "availability snapshots",
        "CTB %": "Availability %",
        "CTB ratio": "Availability Ratio",
        "CTB status": "Availability Status",
    }
    
    for old, new in replacements.items():
        content, count = re.subn(re.escape(old), new, content)
        print(f"Replaced '{old}' -> '{new}' ({count} times)")
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Terminology renaming complete! Final file size:", len(content))

if __name__ == '__main__':
    rename_ctb()
