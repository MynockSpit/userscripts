import "core-js/stable";
import "regenerator-runtime/runtime";
import Color from 'color'
import { onDomChange } from '../../lib/on-dom-change'

const stylesToFix = new Set([
  'color',
  'background-color',
  'background-image',
  'background',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'box-shadow',
  'text-shadow',
])

const lightenDarksBy = 15;
const darkenLightsBy = 10;
const uiHue = undefined;
const fontHue = undefined;

async function request(url, options) {
  try {
    const response = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: 'GET',
        onload(response) { resolve(response) },
        onerror(response) { reject(response) }
      })
    })

    return {
      status: response.status,
      statusText: response.statusText,
      body: response.responseText,
      headers: response.responseHeaders
    }
  } catch (e) {
    let response = await fetch(url, options)

    return {
      status: response.status,
      statusText: response.statusText,
      body: await response.text(),
      headers: response.headers
    }

  }
}

function exclude() {
  if (/facebook\.com/.test(window.location.href)) {
    return true
  }

  return false
}

async function darken() {
  if (!exclude()) {
    let failed = await darkenViaSheets()
    parseVariableRules()

    // if (!failed) {
    //   recurseAndFixElements(false)
    // } else {
    //   console.debug('Failed to load some stylesheets; falling back to manual element changes.')
    //   recurseAndFixElements()
    // }

    ensureBasicColors()

    console.debug({ totalStylesFixed })
  }
}

async function darkenViaSheets() {
  let nullSheets = []
  let atLeastOneFailure = false

  let sheets = []

  Array.from(document.styleSheets).forEach((sheet, index) => {
    try {
      // so, to make a sheet that we can interact with as an object, we have to insert it into the dom
      sheets[index] = cloneSheet(sheet)
      recurseAndFixRules(sheets[index].sheet)

      if (sheet.cssRules === null) {
        throw new Error("Can't read stylesheet.")
      }
    } catch (e) {
      nullSheets.push(request(sheet.href)
        .then(async ({ body }) => {
          sheets[index] = createSheet(body)
          recurseAndFixRules(sheets[index].sheet)
        })
        .catch(reason => {
          atLeastOneFailure = true
          console.warn(reason)
        })
      )
    }
  })

  await Promise.all(nullSheets)

  sheets.forEach(sheetElement => {
    // console.log(sheetText(sheetElement.sheet))
    console.log(sheetText(sheetElement.sheet).trim())
    if (sheetText(sheetElement.sheet).trim()) {
      cloneSheet(sheetElement.sheet, { replace: sheetElement })
    } else {
      sheetElement.parentElement.removeChild(sheetElement)
    }
  })

  return atLeastOneFailure
}

function sheetText(sheet) {
  let rules = []
  sheet.cssRules.forEach(rule => {
    rules.push(rule.cssText)
  })
  return rules.join('\n')
}

function cloneSheet(sheet, options = {}) {
  let rules = []
  sheet.cssRules.forEach(rule => {
    rules.push(rule.cssText)
  })
  let attributes = Array.from(sheet.ownerNode.attributes)
  return createSheet(rules.join('\n'), { attributes, ...options })
}

function createSheet(text, { attributes, replace = false } = {}) {
  let style = document.createElement('style')
  style.innerHTML = text

  style.setAttribute('created-by-me', 'true')

  if (attributes) {
    attributes.forEach(({ name, value }) => {
      style.setAttribute(name, value)
    })
  }

  if (replace) {
    replace.insertAdjacentElement('afterend', style)
    replace.parentElement.removeChild(replace)
  } else {
    document.head.appendChild(style)
  }
  return style
}

function ensureBasicColors() {
  let htmlStyle = getComputedStyle(document.body.parentElement)

  let bgColor = Color(htmlStyle.backgroundColor)
  let bgColorFinal = bgColor
    .alpha(1)
    .lightness(bgColor.lightness() + lightenDarksBy)
    .string()

  let color = htmlStyle.color
  let fontColor = Color(htmlStyle.color)
  if (fontColor.isDark()) {
    color = 'white'
  }

  createSheet(`html {
    background-color: ${bgColorFinal};
    color: ${color};
  }`)
}

function recurseAndFixElements(useComputed = true, element = document.body.parentElement) {
  let style = useComputed ? getComputedStyle(element) : element.style
  let count = 0

  Array.from(style).forEach(styleToFix => {
    let fixed = fixStyle(element, styleToFix, style[styleToFix])
    if (count === 0 && fixed) {
      count += 1
    }
  })

  if (element.children.length) {
    Array.from(element.children).forEach(child => {
      count += recurseAndFixElements(useComputed, child)
    })
  }

  return count
}

let variableRules = []

function recurseAndFixRules(sheetish) {
  try {
    let cssRules = sheetish.cssRules

    for (let index = 0, i = 0; index < cssRules.length && i < 1000;) {
      let rule = cssRules[index]
      let increment = true
      i++

      if (/@media (prefers-color-scheme-dark)/.test(rule.cssText)) {
        console.debug('dark-mode', rule)
        return
      }
      if (rule.cssRules) {
        recurseAndFixRules(rule)
      } else if (rule.styleSheet) {
        recurseAndFixRules(rule.styleSheet)
      } else {
        try {
          let hasVariables = false
          Array.from(rule.style).forEach(style => {
            if (style.startsWith('--')) {
              hasVariables = true
            } else {
              fixStyle(rule, style)
            }
          })

          if (hasVariables) {
            variableRules.push(rule)
          }

          if (rule.style.length === 0) {
            increment = false
            sheetish.deleteRule(index)
          }

        } catch (error) {
          console.warn(error)
        }
      }

      if (increment) {
        index++
      }
    }
  } catch (error) {
    if (sheetish.cssRules !== null) {
      console.warn(error)
    }
  }
}

function parseVariableRules() {
  variableRules.forEach(rule => {
    let cssText = rule.style.cssText.split(';').map(ruleBlip => {
      let [key, value] = ruleBlip.split(':').map(item => item.trim())

      let color
      if (variablesUsedFor[key]) {
        if (variablesUsedFor[key].font) {
          color = makeColor(key, value, true)
        } else {
          color = makeColor(key, value, false)
        }
      }

      if (key && (color || value)) {
        return `${key}: ${color || value};`
      }
    }).join(' ')
    rule.style.cssText = cssText
  })
}

const variablesUsedFor = {
}

function makeColor(style, value, isFont = undefined, debug = false) {

  let notInherit = value !== 'inherit'
  let notInitial = value !== 'initial'
  let notCurrentColor = value !== 'currentcolor'
  let valueIsVariable = Boolean(value && value.startsWith('var(--'))

  if (!isFont) {
    isFont = (style === 'color')
  }

  // collect information on variables for later
  if (valueIsVariable) {
    let trimmedVariable = value.replace(/^var\(/, '').replace(/\)$/, '')

    if (!variablesUsedFor[trimmedVariable]) {
      variablesUsedFor[trimmedVariable] = {
        font: 0,
        ui: 0
      }
    }
    if (isFont) {
      variablesUsedFor[trimmedVariable].font++
    } else {
      variablesUsedFor[trimmedVariable].ui++
    }

    return
  }

  // ignore some values that'll implode
  try {
    if (value && notInherit && notInitial && notCurrentColor) {

      let color = value || target.style[style]
      // is font-related, make light
      if (isFont) {
        color = Color(color)
        if (color.isDark()) {
          color = color.negate()
          color = color.lightness(color.lightness() - darkenLightsBy)
        }

        if (fontHue) {
          color = color.hue(fontHue)
        }
      }

      // is ui-related; make dark
      else {
        color = Color(color)
        if (color.isLight()) {
          color = color.negate()
          color = color.lightness(color.lightness() + lightenDarksBy)
        }

        if (uiHue) {
          color = color.hue(uiHue)
        }
      }

      return color.string()
    }
  } catch (error) {
    if (debug) {
      console.warn(`Error parsing ${style}: ${value}`, value, error)
    }
  }

  return
}

let totalStylesFixed = 0
function fixStyle(target, style, value) {
  value = value || target.style[style];

  let newValue
  if (stylesToFix.has(style)) {
    let rgbHslHwb = '(?:rgb|hsl|hwb)a?\\([^)]*\\)'
    let hexish = '#\\w{3}\\w?(?:\\w{2})?(?:\\w{2})?'
    let regex = new RegExp(`(${rgbHslHwb}|${hexish}|\\s+)`);

    newValue = value.split(regex).map(segment => {
      let color
      if (segment.trim()) {
        try {
          color = makeColor(style, segment)
        } catch (e) {
          // ignore
        }
      }
      return color || segment
    }).join('')
  }

  if (newValue) {
    if (totalStylesFixed < 10) {
      console.debug(target, style, newValue)
    }
    target.style[style] = newValue

    // invert all background images
    // this should mostly miss things like profile pictures, and hopefully just get ui elements... but we'll see
    if (style === 'background-image' && value.startsWith('url(')) {
      target.style.filter = `invert(1)`
    }

    totalStylesFixed++
    return true
  } else {
    target.style[style] = ''
  }

  return false
}

darken()

onDomChange(() => {
  // darken()
})

setTimeout(() => {
  // console.log('retry')
  // darken()
}, 5000)
