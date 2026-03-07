/**
 * Script to automatically bump the version across all necessary files in the project.
 * Run with: node update-version.js <new_version>
 */

const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(newVersion)) {
    console.error("Error: Please provide a valid semantic version containing three numbers (e.g., 0.8.4)");
    console.error("Usage: node update-version.js <version>");
    process.exit(1);
}

console.log(`Updating version to ${newVersion}...`);

// 1. package.json
const pkgPath = path.join(__dirname, 'package.json');
try {
    let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
    console.log('✅ Updated package.json');
} catch (e) {
    console.error('❌ Failed to update package.json:', e.message);
}

// 2. src-tauri/tauri.conf.json
const tauriConfPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
try {
    let tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4) + '\n');
    console.log('✅ Updated src-tauri/tauri.conf.json');
} catch (e) {
    console.error('❌ Failed to update src-tauri/tauri.conf.json:', e.message);
}

// 3. src-tauri/Cargo.toml
const cargoTomlPath = path.join(__dirname, 'src-tauri', 'Cargo.toml');
try {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
    // Replace the first instance of 'version = "x.x.x"' (which belongs to [package])
    cargoToml = cargoToml.replace(/version\s*=\s*".*?"/, `version = "${newVersion}"`);
    fs.writeFileSync(cargoTomlPath, cargoToml);
    console.log('✅ Updated src-tauri/Cargo.toml');
} catch (e) {
    console.error('❌ Failed to update src-tauri/Cargo.toml:', e.message);
}

// 4. src/index.html
const indexPath = path.join(__dirname, 'src', 'index.html');
try {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    // Finds the specific text ">v0.x.x<" that you added into the footer of index.html
    indexHtml = indexHtml.replace(/>v\d+\.\d+\.\d+</, `>v${newVersion}<`);
    fs.writeFileSync(indexPath, indexHtml);
    console.log('✅ Updated src/index.html');
} catch (e) {
    console.error('❌ Failed to update src/index.html:', e.message);
}

console.log(`\n🎉 Version successfully updated to v${newVersion}!`);
console.log('You can now run `npm run tauri build` to compile the new release.');
