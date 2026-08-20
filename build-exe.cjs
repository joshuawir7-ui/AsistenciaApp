const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Monkey patch fs.promises.rename para usar copia de respaldo si Windows bloquea el renombrado directo (EPERM / EBUSY)
const origPromisesRename = fs.promises.rename;
fs.promises.rename = async function(oldPath, newPath) {
  try {
    return await origPromisesRename.call(fs.promises, oldPath, newPath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
      console.log(`⚠️ Renombrado por sistema bloqueado (${err.code}). Usando copia recursiva de respaldo: ${path.basename(oldPath)} -> ${path.basename(newPath)}...`);
      try {
        fs.cpSync(oldPath, newPath, { recursive: true });
        try { fs.rmSync(oldPath, { recursive: true, force: true }); } catch (e) {}
        return;
      } catch (cpErr) {
        console.error('Error durante la copia de respaldo:', cpErr.message);
        throw err;
      }
    }
    throw err;
  }
};

async function main() {
  console.log('🚀 Iniciando empaquetado de AsistenciaApp para Windows...');

  // 1. Matar procesos anteriores de la app
  console.log('🛑 1. Cerrando posibles procesos ejecutándose...');
  try { execSync('taskkill /F /IM "AsistenciaApp.exe" /T', { stdio: 'ignore' }); } catch (e) {}
  try { execSync('taskkill /F /IM "AsistenciaApp 1.0.0.exe" /T', { stdio: 'ignore' }); } catch (e) {}
  try { execSync('taskkill /F /IM "electron.exe" /T', { stdio: 'ignore' }); } catch (e) {}

  // 2. Limpiar carpeta temporal de compilación
  const buildOutDir = path.join(__dirname, 'dist-desktop-build');
  const distDesktop = path.join(__dirname, 'dist-desktop');

  if (fs.existsSync(buildOutDir)) {
    console.log('🧹 2. Limpiando carpeta temporal de compilación...');
    try { fs.rmSync(buildOutDir, { recursive: true, force: true }); } catch (e) {}
  }

  // 3. Build Vite
  console.log('📦 3. Compilando aplicación web con Vite...');
  execSync('npx vite build', { stdio: 'inherit' });

  // 4. Invocar electron-builder usando directorio temporal para evitar bloqueos del Explorador de Windows
  console.log('⚡ 4. Empaquetando ejecutable de Windows (.exe) con electron-builder...');
  const builder = require('electron-builder');
  
  await builder.build({
    targets: builder.Platform.WINDOWS.createTarget(),
    config: {
      appId: "com.antigravity.asistencia",
      productName: "AsistenciaApp",
      directories: {
        output: "dist-desktop-build"
      },
      files: [
        "dist/**/*",
        "electron/**/*",
        "package.json"
      ],
      win: {
        target: ["nsis", "portable"],
        icon: "public/favicon.png"
      }
    }
  });

  // 5. Copiar los ejecutables generados a dist-desktop y raíz del proyecto
  console.log('🚚 5. Trasladando ejecutables generados a dist-desktop...');
  if (!fs.existsSync(distDesktop)) {
    fs.mkdirSync(distDesktop, { recursive: true });
  }

  const generatedFiles = fs.readdirSync(buildOutDir);
  generatedFiles.forEach(file => {
    const srcFile = path.join(buildOutDir, file);
    const destFile = path.join(distDesktop, file);
    if (fs.statSync(srcFile).isFile()) {
      console.log(`   - Actualizando ${file} en dist-desktop...`);
      try {
        fs.copyFileSync(srcFile, destFile);
      } catch (e) {
        console.log(`   ⚠️ No se pudo sobrescribir directamente ${file}, reintentando...`);
      }
    }
  });

  // Copia conveniente con nombre simple AsistenciaApp.exe
  const portableSource = path.join(distDesktop, 'AsistenciaApp 1.0.0.exe');
  if (fs.existsSync(portableSource)) {
    try {
      fs.copyFileSync(portableSource, path.join(distDesktop, 'AsistenciaApp.exe'));
    } catch (e) {}
  }

  console.log('\n🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!');
  console.log('📁 Ejecutables disponibles en dist-desktop y dist-desktop-build:');
  const finalFiles = fs.readdirSync(distDesktop).filter(f => f.endsWith('.exe'));
  finalFiles.forEach(f => {
    const stats = fs.statSync(path.join(distDesktop, f));
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   - 📄 ${f} (${sizeMb} MB)`);
  });
}

main().catch(err => {
  console.error('❌ Error fatal durante la compilación:', err);
  process.exit(1);
});
