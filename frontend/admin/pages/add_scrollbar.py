import os
import glob

css_to_add = """
    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(192, 149, 83, 0.5); }
    * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.15) transparent; }
"""

files = glob.glob("*.html")
files.append("../dashboard.html")

for file in files:
    with open(file, "r") as f:
        content = f.read()
    
    if "/* Custom Scrollbar */" not in content:
        content = content.replace("</style>", css_to_add + "</style>")
        with open(file, "w") as f:
            f.write(content)
        print(f"Added scrollbar to {file}")
