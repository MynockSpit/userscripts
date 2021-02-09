import "core-js/stable";
import "regenerator-runtime/runtime";
import Color from 'color'
import { onDomChange } from '../../lib/on-dom-change'

const stylesToFix = [
  'color',
  'background-color',
  'background',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color'
]

// background-image w/ gradients
// box-shadows
// border?

const lightenBy = 15;

function exclude() {
  if (/facebook\.com/.test(window.location.href)) {
    return true
  }
  
  return false
}

async function darken() {
  if (!exclude()) {
  let failed = await darkenViaSheets()
  ensureBackgroundIsDark()

  return
  if (!failed) {
    recurseAndFixElements(false)
  } else {
    console.debug('Failed to load some stylesheets; falling back to manual element changes.')
    recurseAndFixElements()
    onDomChange(() => {
      recurseAndFixElements()
    })
  }
  }

}

async function darkenViaSheets() {
  let nullSheets = []
  let atLeastOneFailure = false

  Array.from(document.styleSheets).forEach(sheet => {
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
        .catch((reason) => {
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

function ensureBackgroundIsDark() {
  let htmlStyle = getComputedStyle(document.body.parentElement)

  let color = Color(htmlStyle.backgroundColor)

  document.body.parentElement.style.backgroundColor = color
    .alpha(1)
    .lightness(color.lightness() + lightenBy)
    .string()
}

function recurseAndFixElements(useComputed = true, element = document.body.parentElement) {
  let style = useComputed ? getComputedStyle(element) : element.style
  let count = 0

  Array.from(style).forEach(styleToFix => {
    if (stylesToFix.includes(styleToFix)) {
      console.log(styleToFix)
      let fixed = fixStyle(element, styleToFix, style[styleToFix])
      if (count === 0 && fixed) {
        count += 1
      }
    }
  })

  if (element.children.length) {
    Array.from(element.children).forEach(child => {
      count += recurseAndFixElements(useComputed, child)
    })
  }

  return count
}

function recurseAndFixRules(cssRules) {
  try {
    Array.from(cssRules).forEach(rule => {
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
            console.log(rule.style.cssText)

            let cssText = rule.style.cssText.split(';').map(ruleBlip => {
              let [key, value] = ruleBlip.split(':').map(item => item.trim())

              let color
              if (key.startsWith('--')) {
                color = makeColor(key, value)
              }

              if (key && (color || value)) {
                return `${key}: ${color || value};`
              }
            }).join(' ')
            rule.style.cssText = cssText

            console.log(cssText)

            // Right now, we're just naively flipping colors. Might be better to see what kinds of things these vars are used for, then decide to flip them or not.
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

function makeColor(style, value, debug = true) {

  let notInherit = value !== 'inherit'
  let notInitial = value !== 'initial'
  let notCurrentColor = value !== 'currentcolor'
  let notVariable = value && !value.startsWith('var(--')

  if (style === '--highlight-bg') {
    console.log('what_sdf', style, value, notInherit, notInitial, notCurrentColor, notVariable)
  }

  // ignore some values that'll implode
  try {
    if (value && notInherit && notInitial && notCurrentColor && notVariable) {
      if (style === 'color') {
        let color = Color(value)
        if (color.isDark()) {
          return color.negate().string()
        }
      }

      else if (
        (style === 'background-color') ||
        (style === 'background') ||
        (style === 'border-color') ||
        (style === 'border-top-color') ||
        (style === 'border-right-color') ||
        (style === 'border-bottom-color') ||
        (style === 'border-left-color')
      ) {
        let color = Color(value || target.style[style])
        if (color.isLight()) {
          color = color.negate()
          color = color.lightness(color.lightness() + lightenBy)

          return color.string()
        }
      }

      else if (style.startsWith('--')) {
        let color = Color(value)
        if (color.isDark()) {
          return color.negate().string()
        } else {
          color = color.negate()
          color = color.lightness(color.lightness() + lightenBy)

          return color.string()
        }
      }

      else if (style === 'box-shadow') {
        // ugh
      }
    }
  } catch (error) {
    if (debug) {
      console.warn(`Error parsing ${style}: ${value}`, value, error)
    }
  }

  return
}

function fixStyle(target, style, value) {
  value = value || target.style[style]

  let color = makeColor(style, value)

  if (color) {
    target.style[style] = color
    return true
  }

  return false
}

darken()
