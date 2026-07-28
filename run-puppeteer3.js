const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:8080/admin/pages/frame_models.html', {waitUntil: 'networkidle0'});
  
  await page.evaluate(async () => {
    const THREE = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js');
    const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/uploads/models/1784746714583535000-thick_simple_picture_frame.glb');
    
    const sourceModel = gltf.scene;
    const sourceBox = new THREE.Box3().setFromObject(sourceModel);
    const sourceSize = new THREE.Vector3();
    sourceBox.getSize(sourceSize);
    
    console.log("Source Size:", sourceSize.toArray());
    
    // Simulate what resolveModelAxisNormalization does
    const dimensions = { x: sourceSize.x, y: sourceSize.y, z: sourceSize.z };
    const sorted = Object.entries(dimensions).sort(([, a], [, b]) => a - b);
    const depthAxis = sorted[0][0];
    
    console.log("Depth Axis:", depthAxis);
  });
  
  await browser.close();
})();
