import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Ensuring Python dependencies are installed...');

function runCommand(command) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.warn(`Command failed: ${command}`);
    return false;
  }
}

const reqFile = 'ai_service/requirements.txt';

// Detect if we are likely on Render (Linux)
const isLinux = process.platform === 'linux';

let success = false;

if (isLinux) {
  // On Render, ensure pip is available and install dependencies into the user's local site-packages
  success =
    runCommand(`python3 -m pip install -r ${reqFile} --break-system-packages`) ||
    // If pip fails (e.g., pip not found), download it via bootstrap
    (
      runCommand('curl -fsSL https://bootstrap.pypa.io/get-pip.py -o get-pip.py') &&
      runCommand('python3 get-pip.py --break-system-packages') &&
      runCommand(`python3 -m pip install -r ${reqFile} --break-system-packages`)
    );
} else {
  // Local (Windows/Mac)
  success =
    runCommand(`python -m pip install -r ${reqFile}`) ||
    runCommand(`py -m pip install -r ${reqFile}`) ||
    runCommand(`python3 -m pip install -r ${reqFile}`);
}

if (!success) {
  console.error('Failed to install Python dependencies. Please check the logs.');
  process.exit(1);
} else {
  console.log('Python dependencies installed successfully.');
}
