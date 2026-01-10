#!/usr/bin/env node

/**
 * Camera Codec Detection Tool
 * Detectează automat codec-ul video (H.264/H.265) pentru fiecare cameră
 * și generează raport pentru optimizare
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Încarcă camerele din config JSON
const configPath = '/opt/dss-edge/config/cameras.json';

if (!fs.existsSync(configPath)) {
    console.error(`❌ Eroare: Nu am găsit fișierul de configurare la ${configPath}`);
    process.exit(1);
}

let cameras = [];
try {
    const data = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    cameras = JSON.parse(data);
} catch (e) {
    console.error(`❌ Eroare la citirea cameras.json: ${e.message}`);
    process.exit(1);
}

if (!Array.isArray(cameras)) {
    console.error('❌ Eroare: cameras.json nu este un array!');
    process.exit(1);
}

console.log(`\n🔍 Detectare codec pentru ${cameras.length} camere active...\n`);

const results = [];
let completed = 0;

function detectCodec(camera) {
    return new Promise((resolve) => {
        // Use rtspHd if available, otherwise rtsp
        const rtspUrl = (camera.rtspHd || camera.rtsp || '').split('#')[0];

        if (!rtspUrl || !camera.enabled) {
            if (!camera.enabled) {
                resolve({ ...camera, codec: 'DISABLED', compatible: true });
            } else {
                resolve({ ...camera, codec: 'UNKNOWN', error: 'No RTSP URL' });
            }
            return;
        }

        // Folosim ffprobe pentru a detecta codec-ul
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',  // 5 secunde timeout
            rtspUrl
        ]);

        let output = '';
        let errorOutput = '';

        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ffprobe.on('close', (code) => {
            const codec = output.trim().toUpperCase();

            if (codec === 'H264') {
                resolve({ ...camera, codec: 'H.264', compatible: true });
            } else if (codec === 'HEVC' || codec === 'H265') {
                resolve({ ...camera, codec: 'H.265', compatible: false, needsTranscode: true });
            } else if (codec) {
                resolve({ ...camera, codec, compatible: false });
            } else {
                resolve({ ...camera, codec: 'UNKNOWN', error: errorOutput.substring(0, 100).trim() || 'Connection failed' });
            }
        });

        // Timeout după 10 secunde
        setTimeout(() => {
            ffprobe.kill();
            resolve({ ...camera, codec: 'TIMEOUT', error: 'Detection timeout' });
        }, 10000);
    });
}

async function detectAll() {
    const activeCameras = cameras.filter(c => c.enabled);

    for (const camera of activeCameras) {
        const result = await detectCodec(camera);
        results.push(result);
        completed++;

        const status = result.compatible ? '✅' : (result.needsTranscode ? '⚠️' : '❌');
        console.log(`[${completed}/${activeCameras.length}] ${status} ${camera.name || camera.ip} - ${result.codec} ${result.error ? '(' + result.error + ')' : ''}`);
    }

    // Generează raport
    console.log('\n' + '='.repeat(80));
    console.log('📊 RAPORT FINAL\n');

    const h264 = results.filter(r => r.codec === 'H.264').length;
    const h265 = results.filter(r => r.codec === 'H.265').length;
    const unknown = results.filter(r => r.codec === 'UNKNOWN' || r.codec === 'TIMEOUT').length;

    console.log(`✅ H.264 (WebRTC Compatible): ${h264} camere`);
    console.log(`⚠️  H.265 (Necesită Transcodare): ${h265} camere`);
    console.log(`❌ Erori/Timeout: ${unknown} camere\n`);

    if (h265 > 0) {
        console.log('⚠️  ATENȚIE: Camerele H.265 vor consuma CPU suplimentar pentru WebRTC!');
        console.log(`   Estimare CPU total pentru 32 camere (dacă toate sunt H.264): ~60-70%`);
        console.log(`   Dacă rămân H.265, serverul va atinge 100% CPU rapid!\n`);

        console.log('📋 Camere detectate ca H.265 (Trebuie schimbate în H.264 din setările camerei):');
        results.filter(r => r.needsTranscode).forEach(cam => {
            console.log(`   - ${cam.name || cam.ip} (${cam.ip})`);
        });
    }

    if (unknown > 0) {
        console.log('\n❌ Camere care nu răspund (Verificați IP/Port/User/Pass):');
        results.filter(r => r.codec === 'UNKNOWN' || r.codec === 'TIMEOUT').forEach(cam => {
            console.log(`   - ${cam.name || cam.ip} (${cam.ip}) - ${cam.error}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('🚀 CONCLUZIE PENTRU 32 CAMERE:');
    if (h265 === 0 && unknown === 0) {
        console.log('   Toate camerele sunt H.264. Puteți adăuga până la 32 camere fără transcodare.');
        console.log('   Consum estimat: ~65% CPU total.');
    } else if (h265 > 0) {
        console.log(`   Trebuie să schimbați cele ${h265} camere H.265 în H.264 pentru a suporta 32 camere.`);
    } else {
        console.log('   Rezolvați erorile de conexiune înainte de a mări numărul de camere.');
    }
    console.log('='.repeat(80) + '\n');
}

detectAll().catch(console.error);
