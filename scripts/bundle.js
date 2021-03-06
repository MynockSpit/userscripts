const Bundler = require('parcel');
const fs = require('fs');
const nodePath = require('path');
const recursive = require("recursive-readdir");
const os = require('os')

const isBuild = process.env.NODE_ENV === 'production'

function getEntryFiles() {
  let entryFiles = []

  return new Promise(resolve => {
    recursive(nodePath.join(__dirname, '../src'), (err, files) => {
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

function buildPath(name) {
  if (isBuild) {
    return nodePath.join(__dirname, '../userscripts', nodePath.basename(name))
  } else {
    return nodePath.join(__dirname, '../userscripts', nodePath.basename(name, '.user.js') + '.test.user.js')
  }
}

function writeFile(bundle) {

  let files = []

  if (bundle.name) {
    files.push({
      parcelBuild: bundle.name,
      build: buildPath(bundle.name),
      meta: nodePath.dirname(bundle.entryAsset.name) + '/meta.json'
    })

  } else {
    bundle.childBundles.forEach(childBundle => {
      files.push({
        parcelBuild: childBundle.name,
        build: buildPath(childBundle.name),
        meta: nodePath.dirname(childBundle.entryAsset.name) + '/meta.json'
      })
    })
  }

  files.forEach(userscripts => {
    let file = fs.readFileSync(userscripts.parcelBuild, 'utf-8')
    let meta = JSON.parse(fs.readFileSync(userscripts.meta, 'utf-8'))

    if (meta) {

      let metadataBlock = ['// ==UserScript==']

      Object.entries(meta.userscriptProperties).forEach(([key, value]) => {
        if (key === '@name' && !isBuild) {
          metadataBlock.push(`// ${key}  ${value} [local]`)
        } else {
          metadataBlock.push(`// ${key}  ${value}`)
        }
      })

      metadataBlock.push(
        '// ==/UserScript==',
        '',
        '// This file was generated by a build process. Manual edits will be wiped away the next time the build is run.'
      )

      let outputs = []

      outputs.push(userscripts.parcelBuild)
      outputs.push(userscripts.build)

      outputs.forEach(outputPath => {
        let fixedPath = outputPath.replace(/^~/, os.homedir())
        let canAccess = false
        try {
          fs.accessSync(nodePath.dirname(fixedPath))
          canAccess = true
        } catch (e) { 
        }

        if (canAccess) {
          fs.writeFileSync(fixedPath, [
            ...metadataBlock,
            ` `,
            `(function() {`,
            file,
            `}());`
          ].join('\n'))
          console.log(`Updated ${fixedPath}`)
        }
      })
    }
  })

  return null
}

bundleUserScripts()