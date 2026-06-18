import re

def refactor():
    file_path = 'app/page.tsx'
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    print("Initial file size:", len(content))
    
    # 1. Replace the specific neon gradients
    replacements = {
        # Progress bars & Buttons
        "linear-gradient(90deg, var(--color-primary) 0%, #818cf8 100%)": "var(--color-primary)",
        "linear-gradient(90deg, #818cf8 0%, #fb923c 100%)": "linear-gradient(90deg, var(--color-primary) 0%, var(--severity-high-text) 100%)",
        
        # Charts
        "linear-gradient(180deg, #fb923c 0%, #f43f5e 100%)": "linear-gradient(180deg, var(--severity-high-text) 0%, var(--severity-critical-text) 100%)",
        "linear-gradient(180deg, #818cf8 0%, #4f46e5 100%)": "var(--color-primary)",
        
        # Logo and icons
        "linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)": "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
        "linear-gradient(180deg, #818cf8 0%, #4f46e5 100%)": "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)",
        "linear-gradient(90deg, var(--color-primary) 0%, #818cf8 100%)": "var(--color-primary)",
        "linear-gradient(135deg, #818cf8 0%, #8b5cf6 100%)": "var(--color-primary)",
        "linear-gradient(135deg, #818cf8, #4f46e5)": "var(--color-primary)",
        
        # Border-bottom indicators
        "bpActiveView === 'workload' ? '2px solid #8b5cf6'": "bpActiveView === 'workload' ? '2px solid var(--color-primary)'",
        "bpActiveView === 'history' ? '2px solid #8b5cf6'": "bpActiveView === 'history' ? '2px solid var(--color-primary)'",
        "bpActiveView === 'followup' ? '2px solid #8b5cf6'": "bpActiveView === 'followup' ? '2px solid var(--color-primary)'",
        
        # Spinners
        "border: '4px solid rgba(139, 92, 246, 0.1)', borderTop: '4px solid #8b5cf6'": "border: '4px solid rgba(59, 130, 246, 0.1)', borderTop: '4px solid var(--color-primary)'",
    }
    
    for old, new in replacements.items():
        content, count = re.subn(re.escape(old), new, content)
        print(f"Replaced gradient/element '{old[:40]}...' -> {count} times")
        
    # 2. Map specific neon hex codes used inline to their clean enterprise counterparts
    # Let's map hardcoded hex codes
    # #818cf8 (neon indigo) -> var(--color-primary) or #60a5fa
    # #4f46e5 (indigo) -> var(--color-primary)
    # #8b5cf6 (neon purple) -> var(--color-primary)
    # #a78bfa (soft neon purple) -> #60a5fa (light steel blue)
    # #a855f7 (purple) -> #6366f1 (professional indigo/blue)
    
    hex_replacements = {
        "'#818cf8'": "'var(--color-primary)'",
        "\"#818cf8\"": "\"var(--color-primary)\"",
        ": '#818cf8'": ": 'var(--color-primary)'",
        ": '#4f46e5'": ": 'var(--color-primary)'",
        ": '#8b5cf6'": ": 'var(--color-primary)'",
        ": '#a78bfa'": ": '#60a5fa'",
        "color: '#a78bfa'": "color: '#60a5fa'",
        "color: '#818cf8'": "color: 'var(--color-primary)'",
        "color: '#8b5cf6'": "color: 'var(--color-primary)'",
        "background: '#8b5cf6'": "background: 'var(--color-primary)'",
        "borderLeft: '3px solid #a78bfa'": "borderLeft: '3px solid var(--color-primary)'",
        "borderLeft: '3px solid #8b5cf6'": "borderLeft: '3px solid var(--color-primary)'",
        "borderLeft: '3px solid #818cf8'": "borderLeft: '3px solid var(--color-primary)'",
        "badgeColor = '#818cf8'": "badgeColor = 'var(--color-primary)'",
        "badgeColor = '#a78bfa'": "badgeColor = '#60a5fa'",
        "iconColor = '#818cf8'": "iconColor = 'var(--color-primary)'",
        "borderBottomColor: '#818cf8'": "borderBottomColor: 'var(--color-primary)'",
        "borderBottomColor: '#8b5cf6'": "borderBottomColor: 'var(--color-primary)'",
        "borderRight: '1px solid rgba(129, 140, 248, 0.15)'": "borderRight: '1px solid var(--border-color)'",
        "borderRight: '1px solid rgba(139, 92, 246, 0.15)'": "borderRight: '1px solid var(--border-color)'",
    }
    
    for old, new in hex_replacements.items():
        content, count = re.subn(re.escape(old), new, content)
        print(f"Replaced inline color '{old}' -> {count} times")
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Refactoring complete! Final file size:", len(content))

if __name__ == '__main__':
    refactor()
