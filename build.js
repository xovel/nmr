'use strict'

const fs = require('fs')
const path = require('path')

const pug = require('pug')
const yaml = require('js-yaml')
const marked = require('marked')

const CleanCSS = require('clean-css')
const UglifyJS = require('uglify-js')

const distFolder = 'docs'

if (!fs.existsSync(distFolder)) {
  fs.mkdirSync(distFolder)
}

function read(filepath) {
  return fs.readFileSync(filepath, 'utf8').toString()
}

function write(dest, content) {
  const filepath = path.join(distFolder, dest)
  const filedir = path.dirname(filepath)

  if (!fs.existsSync(filedir)) {
    fs.mkdirSync(filedir, {recursive: true})
  }

  fs.writeFile(filepath, content, err => {
    if (err) throw err
    console.log(`${filepath} write successful!`)
  })
}

function loadYML(ymlFilePath) {
  return yaml.safeLoad(read(ymlFilePath))
}

function isDirectory(filepath) {
  try {
    let fileStat = fs.statSync(filepath)
    return fileStat.isDirectory()
  } catch (e) {
    //
    console.error(e)
  }
  return false;
}

const config = loadYML('_config.yml')

const allNMR = loadNMR('sources/nmr')
const allPlayList = loadNMR('sources/playlist')

function loadNMR(nmrPath) {
  const ret = []

  const list = fs.readdirSync(nmrPath).sort().reverse()

  list.forEach(item => {
    const curPath = path.join(nmrPath, item)
    if (isDirectory(curPath)) {
      ret.push(...loadNMR(curPath))
    } else if (
      path.extname(curPath) === '.yml'
      || path.extname(curPath) === '.yaml'
    ) {
      const currents = [].concat(loadYML(curPath))
      currents.reverse().forEach(current => {
        if (current.artist) {
          current.artist = [].concat(current.artist)
        } else {
          current.artist = []
        }

        if (current.intro && config.marked) {
          current.intro = marked(current.intro)
        }

        if (typeof current.duration === 'number') {
          current.duration = transferDuration(current.duration)
        }

        ret.push(current)
      })
    }
  })

  return ret
}

function transferDuration(seconds) {
  const minite = Math.floor(seconds / 60)
  let second = seconds % 60
  if (second < 10) {
    second = '0' + second
  }
  return `${minite}:${second}`
}

const indexCompiler = pug.compile(read('templates/index.pug'), {
  filename: 'templates/index.pug',
  // pretty: true
})

const playlistCompiler = pug.compile(read('templates/playlist.pug'), {
  filename: 'templates/playlist.pug',
  // pretty: true
})

fs.copyFileSync('favicon.ico', 'docs/favicon.ico')

const jsData = {
  width: 300,
  auto: 1,
  height: 86,
  innerHeight: 66
}

if (config.player) {
  jsData.auto = config.player.auto === false ? 0 : 1
  if (config.player.mini) {
    jsData.height = 52
    jsData.innerHeight = 32
  }
}

const cssData = {
  width: jsData.width
}

function loadCSS(filepath) {
  return read(filepath).replace(/\$\{([^}]+)\}/g, (_, name) => cssData[name] || '')
}

const styleRaw = [
  loadCSS('styles/reset.css'),
  loadCSS('styles/index.css'),
  loadCSS('styles/listen.css')
].join('\n')

const cleanCssOptions = {}
const styleContent = new CleanCSS(cleanCssOptions).minify(styleRaw).styles

const pugData = {
  config,
  list: allNMR,
  playlist: allPlayList
}

if (config.style) {
  pugData.style = styleContent
} else {
  write('style/index.css', styleContent)
}

const jsRaw = read('scripts/index.js').replace(/\$\{([^}]+)\}/g, (_, name) => jsData[name] || '')

const uglifyOptions = {}
const jsContent = UglifyJS.minify(jsRaw, uglifyOptions).code

if (config.script) {
  pugData.script = jsContent
} else {
  write('js/index.js', jsContent)
}

const indexContent = indexCompiler(pugData)

write('index.html', indexContent)

allPlayList.forEach(item => {
  const curList = {}

  item.song.forEach(sub => {
    if (typeof sub.duration === 'number')
      sub.duration = transferDuration(sub.duration)
    curList[sub.id] = sub
  })

  item.list.forEach(sub => {
    if (typeof sub.duration === 'number')
      sub.duration = transferDuration(sub.duration)
    curList[sub.id] = sub
  })

  write(`/playlist/${item.id}.html`, playlistCompiler({
    ...pugData,
    playlist: item,
    list: item.song.map(sub => curList[sub.id])
  }))
})
