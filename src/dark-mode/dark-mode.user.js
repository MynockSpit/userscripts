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

    if (!failed) {
      recurseAndFixElements(false)
    } else {
      console.debug('Failed to load some stylesheets; falling back to manual element changes.')
      recurseAndFixElements()
    }

    ensureBasicColors()

    console.log({ totalStylesFixed })
  }
}

async function darkenViaSheets() {
  let nullSheets = []
  let atLeastOneFailure = false

  Array.from(document.styleSheets).forEach(sheet => {
    try {
      // console.log(sheet)
    } catch (e) { }

    try {
      recurseAndFixRules(sheet.cssRules)

      if (sheet.cssRules === null) {
        throw new Error("Can't read stylesheet.")
      }
    } catch (e) {
      nullSheets.push(fetch(sheet.href)
        .then(async response => {
          let text = await response.text()

          let newSheet = createSheet(text, sheet.ownerNode)

          recurseAndFixRules(newSheet.cssRules)
        })
        .catch(reason => {
          atLeastOneFailure = true
          console.warn(reason)
        })
      )
    }
  })

  await Promise.all(nullSheets)

  return atLeastOneFailure
}

function createSheet(text, replace) {
  let style = document.createElement('style')
  style.innerHTML = text
  style.setAttribute('created-by-me', 'true')
  if (replace) {
    replace.insertAdjacentElement('afterend', style)
    replace.parentElement.removeChild(replace)
  } else {
    document.head.appendChild(style)
  }
  return style.sheet
}

function ensureBasicColors() {
  let html = document.body.parentElement
  let htmlStyle = getComputedStyle(html)

  let bgColor = Color(htmlStyle.backgroundColor)

  html.style.backgroundColor = bgColor
    .alpha(1)
    .lightness(bgColor.lightness() + targetDarkness)
    .string()

  console.log(html.style.backgroundColor)

  let fontColor = Color(htmlStyle.color)
  if (fontColor.isDark()) {
    html.style.color = 'white'
  }
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

function recurseAndFixRules(cssRules) {
  try {
    Array.from(cssRules).forEach(rule => {
      if (/@media (prefers-color-scheme-dark)/.test(rule.cssText)) {
        console.log(rule)
        return
      }
      if (rule.cssRules) {
        recurseAndFixRules(rule.cssRules)
      } else if (rule.styleSheet) {
        recurseAndFixRules(rule.styleSheet.cssRules)
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
        } catch (error) {
          console.warn(error)
        }
      }
    })
  } catch (error) {
    if (cssRules !== null) {
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
      console.log(target, style, newValue)
    }
    target.style[style] = newValue

    // invert all background images
    // this should mostly miss things like profile pictures, and hopefully just get ui elements... but we'll see
    if (style === 'background-image' && value.startsWith('url(')) {
      target.style.filter = `invert(1)`
    }

    totalStylesFixed++
    return true
  }

  return false
}

darken()

onDomChange(() => {
  // darken()
})