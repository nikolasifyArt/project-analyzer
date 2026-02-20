Flatten Directory for LLM Usage (Node.js)

Convert an entire codebase into a single structured text file for Large Language Model analysis.

This tool recursively traverses a directory and outputs all text-based files into one file using XML-style tags to preserve structure.

It is designed specifically for LLM workflows such as architecture review, documentation generation, refactoring, and security analysis.

Features

Recursive directory traversal

XML-style file path tagging

Binary file detection and skipping

Configurable ignore patterns

Maximum file size limit protection

Console or file output modes

Zero external dependencies

Requirements

Node.js v18 or later

No npm packages required.

Installation

Clone the repository:

git clone https://github.com/yourusername/flatten-dir-llm.git
cd flatten-dir-llm

Make sure your script file is named:

flatten.mjs
Usage
Basic Usage (Print to Console)
node flatten.mjs ./my_project
Save Output to File
node flatten.mjs ./my_project --output=flattened.txt
Ignore Directories or Files
node flatten.mjs ./my_project --ignore=node_modules,.git,dist

Multiple values must be comma-separated.

Set Maximum File Size (Optional)
node flatten.mjs ./my_project --max-file-bytes=2000000

Default: 2MB per file

Output Format

Each file is wrapped in XML-style tags:

<file path=relative/path/to/file.js>
...file contents...
</file>

This preserves structure while remaining LLM-readable.

Default Ignored Directories

The following are ignored automatically:

node_modules

.git

.hg

.svn

dist

build

out

.next

.cache

coverage

pycache

venv

.venv

Binary File Handling

The script detects binary files using:

Null-byte detection

Non-text character ratio analysis

Binary files are automatically skipped.

Recommended LLM Workflow

Generate flattened file:

node flatten.mjs ./my_project --output=analysis.txt

Paste contents of analysis.txt into your LLM.

Ask questions such as:

Analyze this architecture

Find security vulnerabilities

Generate documentation

Suggest refactoring improvements

Identify performance bottlenecks

Project Structure
flatten-dir-llm/
├── flatten.mjs
├── README.md
Security Warning

Do not upload:

.env files

Secrets

API keys

Private credentials

Always review the generated output before sharing with an LLM.

License

MIT License
