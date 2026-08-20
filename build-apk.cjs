const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando compilación de AsistenciaApp...');

try {
  console.log('📦 1. Compilando aplicación web (vite build)...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('🔄 2. Sincronizando con Capacitor (cap sync)...');
  execSync('npx cap sync', { stdio: 'inherit' });

  console.log('🤖 3. Compilando APK Android (gradlew assembleDebug)...');
  const androidDir = path.join(__dirname, 'android');
  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug';
  execSync(gradlewCmd, { cwd: androidDir, stdio: 'inherit' });

  const generatedApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  
  if (fs.existsSync(generatedApk)) {
    // Buscar la versión más alta de asistencia-notas-vXX.apk en el directorio raíz
    const files = fs.readdirSync(__dirname);
    let maxVer = 0;
    const versionRegex = /^asistencia-notas-v(\d+)\.apk$/i;
    
    files.forEach(file => {
      const match = file.match(versionRegex);
      if (match) {
        const ver = parseInt(match[1], 10);
        if (ver > maxVer) maxVer = ver;
      }
    });

    const nextVer = maxVer + 1;
    const destApkName = `asistencia-notas-v${nextVer}.apk`;
    const destApkPath = path.join(__dirname, destApkName);

    fs.copyFileSync(generatedApk, destApkPath);
    console.log(`\n✅ ¡APK generado exitosamente!`);
    console.log(`📱 Archivo guardado como: ${destApkName}`);
  } else {
    console.error('❌ No se encontró el APK generado en la ruta esperada.');
  }
} catch (error) {
  console.error('❌ Error durante la generación del APK:', error.message);
  process.exit(1);
}
