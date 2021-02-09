const Bundler = require('parcel');
const fs = require('fs');
const nodePath = require('path');
const recursive = require("recursive-readdir");
const os = require('os')

function getEntryFiles() {
  let entryFiles = []

  return new Promise(resolve => {
    recursive(nodePath.join(__dirname, '../userscripts'), (err, files) => {
      files.forEach(file => {
        if (file.endsWith('.user.js') && !file.endsWith('build.user.js')) {
          entryFiles.push(file)
        }
      })

      resolve(entryFiles)
    });
  })
}

async function bundleUserScripts(entryFiles) {
  // Initializes a bundler using the entrypoint location and options provided
  if (!entryFiles) {
    entryFiles = await getEntryFiles()
  }

  const bundler = new Bundler(entryFiles);

  const bundle = await bundler.bundle();

  bundler.on('buildEnd', (f) => {
    writeFile(bundle)
  });

  writeFile(bundle)
};

function writeFile(bundle) {

  let files = []

  if (bundle.name) {
    files.push({
      output: bundle.name,
      build: bundle.entryAsset.name.replace('.user', '.build.user'),
      meta: nodePath.dirname(bundle.entryAsset.name) + '/meta.json'
    })

  } else {
    bundle.childBundles.forEach(childBundle => {
      files.push({
        output: childBundle.name,
        build: childBundle.entryAsset.name.replace('.user', '.build.user'),
        meta: nodePath.dirname(childBundle.entryAsset.name) + '/meta.json'
      })
    })
  }

  files.forEach(userscripts => {
    let file = fs.readFileSync(userscripts.output, 'utf-8')
    let meta = JSON.parse(fs.readFileSync(userscripts.meta, 'utf-8'))

    if (meta) {

      let metadataBlock = ['// ==UserScript==']

      Object.entries(meta.userscriptProperties).forEach(([key, value]) => {
        metadataBlock.push(`// ${key}  ${value}`)
      })

      metadataBlock.push('// ==/UserScript==')

      let outputs = []

      // outputs.push(...meta.outputs)
      outputs.push(userscripts.output)
      if (meta.localBuild) outputs.push(userscripts.build)

      outputs.forEach(outputPath => {
        fs.writeFileSync(outputPath.replace(/^~/, os.homedir()), [
          ...metadataBlock,
          ` `,
          `(function() {`,
          file,
          `}());`
        ].join('\n'))
      })
    }
  })

  return null
}

bundleUserScripts()