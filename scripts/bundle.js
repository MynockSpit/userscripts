const Bundler = require('parcel');
const fs = require('fs');
const nodePath = require('path');
const recursive = require("recursive-readdir");


function getEntryFiles() {
  let entryFiles = []

  return new Promise(resolve => {
    recursive(nodePath.join(__dirname, '../userscripts'), (err, files) => {
      files.forEach(file => {
        if (file.endsWith('.user.js')) {
          entryFiles.push(file)
        }
      })

      resolve(entryFiles)
    });
  })
}


async function bundleUserScripts(entryFiles, options = {}) {
  // Initializes a bundler using the entrypoint location and options provided
  if (!entryFiles) {
    entryFiles = await getEntryFiles()
  }

  console.log(entryFiles)

  const bundler = new Bundler(entryFiles, {
    watch: false,
    ...options,
  });

  const bundle = await bundler.bundle();

  bundler.on('buildEnd', () => {
    console.log(arguments)
    writeFile()
  });

  writeFile(bundle)
};

function writeFile(bundle) {

  let files = []

  if (bundle.name) {
    files.push({
      output: bundle.name,
      meta: nodePath.dirname(bundle.entryAsset.name) + '/meta.json'
    })

  } else {
    bundle.childBundles.forEach(childBundle => {
      files.push({
        output: childBundle.name,
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

      meta.outputs.forEach(outputPath => {
        fs.writeFileSync(outputPath, [
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

module.exports = {
  bundle: bundleUserScripts
}