import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const srcDir = path.join(root, 'src');

fs.mkdirSync(path.join(distDir, 'src'), { recursive: true });
fs.copyFileSync(path.join(srcDir, 'styles.css'), path.join(distDir, 'src', 'styles.css'));
fs.copyFileSync(path.join(root, 'index.html'), path.join(distDir, 'index.html'));
