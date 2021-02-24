import m from 'mithril'
import Mark from 'mark.js'

/**
 * While using this script "as is" is technically possible, once you see the potential for this tool, it is highly likely you'll want to add and remove links. Fortunately, it's built for that eventuality. Instead of installing this script directly, you can reference it from another script that you customize. In that script, you must a) require all dependencies and b) initialize the tooltip.
 * 
 * The config function takes an array of arrays. Each item in the array will map to an entry in the tooltip. There are three kinds of entries.
 * 
 * ### `title` (or `disabled` or `info`)
 * 
 * Unclickable gray text. Useful for providing more information for either in general or for a new section.
 * 
 * e.g. ['title', 'My Title Text']
 * 
 * 
 * ### `link` (or `option`)
 * 
 * A link to a tool. Always opens in a new window. Use the magic string '${accountId}' to insert the account id you clicked.
 * 
 * e.g. [`link`, 'https://www.check-status.foo.com/${accountId}', 'Check my Account Status']
 * 
 * 
 * ### `copy`
 * 
 * Copy designated text. Second argument is the text to copy. Third argument is the label to display for this copy. If the third argument isn't provided, the copy text is used intead.
 * 
 * e.g. ['copy', 'my-cli-tool.py get-info --account-id=${accountId}', 'Copy Get Info CLI']
 * 
 * 
 * ### `line` (or `separator`)
 * 
 * Creates a gray line. Useful for making sections.
 * 
 * 
 * See the default implementation below for an example.
 * 
 * ### `script`
 * 
 * Run a JS script to produce the output.
 * 
 * ['script', (matchedValue) => {
 *   return ['title', matchedValue.toUpperCase()]
 * }]
 * 
 * 
 * ### `menu`
 * 
 * Define a sub-menu.
 * 
 * ['menu', 'Menu Title', [
 *   ['title', 'This is a Submenu'],
 *   ['link', 'http://www.example.com', 'Link to example.com']
 *   // all items are valid including more menus
 * ]]
 * 
 **/

var addContextMenu = (function () {

  // injectCss styles into the page
  // return a function that can be used to inject more later
  var injectCss = (function () {
    let style

    window.addEventListener('load', function load() {
      window.removeEventListener('load', load)

      style = document.head.appendChild(document.createElement('style'))
      insertRules(initialRules)
    })

    var initialRules = {
      "[data-markjs]:hover:not(.selected)": `{
        background: yellow;
      }`,

      ".custom-context-menu, .custom-context-menu .submenu": `{
        position: absolute;
        display: flex;
        flex-direction: column;

        background: #F0F0F0;
        border: 1px solid #BDBDBD;
        border-radius: 4px;
        box-shadow: 0px 5px 10px 5px rgba(0,0,0,.2);
        font-family: Arial;
        font-size: 14px;
        line-height: 1.5em;

        padding: 4px 0px;
        margin-bottom: 20px;

        z-index: 1000000000000000000;
      }`,

      ".custom-context-menu .menu": `{
        display: flex;
        justify-content: space-between;
        position: relative;
        margin: 2px 0px;
        padding: 0px 20px;
      }`,

      ".custom-context-menu .menu:after": `{
        content: '▶';
        font-size: .8em;
        position: relative;
        left: 10px;
      }`,

      ".custom-context-menu .menu:hover": `{
        text-decoration: none;
        color: white;
        background: #499AFB;
      }`,

      ".custom-context-menu .menu:hover>.submenu": `{
        display: flex;
      }`,

      ".custom-context-menu .menu>.submenu": `{
        display: none;
        left: 100%;
        top: calc(0% - 7px);
      }`,

      ".custom-context-menu .info": `{
        margin: 2px 0px;
        padding: 0px 20px;
        color: lightgray;
      }`,

      ".custom-context-menu hr": `{
        margin: 5px 0px;
        border-color: lightgray;
        border-style: solid;
        border-width: 1px 0px;
      }`,

      ".custom-context-menu a": `{
        text-decoration: none;
        cursor: pointer;
        color: black;
        margin: 2px 0px;
        padding: 0px 20px;
      }`,

      ".custom-context-menu a:hover": `{
        text-decoration: none;
        color: white;
        background: #499AFB;
      }`,
    }

    function addRules(rules) {
      if (!loaded)
        initialRules = Object.assign(initialRules, rules)

      else insertRules(rules)
    }

    function insertRules(rules) {
      Object.keys(rules).forEach(key => style.sheet.insertRule(key + rules[key]))
    }

    return addRules
  }())

  // a sub-module responsible for marking up the document
  // returns a function for marking (for testing purposes, mainly)
  var markup = (function() {
    // change from a listener that listens to dom changes to one that listens to mouse interation
    // this will run less often on less stuff, probably
    document.addEventListener('mouseover', function (event) {
      eachMenu((config) => {
        if (config.searchFor.test(event.target.textContent)) {
          mountMenu(config)
          markElement(event.target, config)
        }
      })
    });

    // mount pop-up menu
    // rerun on every observation
    // ideally, it only does anything once, but some apps remove our element
    // re-running this makes sure that if the menu has been removed, it gets replaced
    function mountMenu(config) {
      let root = document.querySelector(`#${config.rootElement}`)

      if (!root) {
        root = document.body.appendChild(document.createElement('div'))
        root.id = config.rootElement

        let needle
        let previousNeedleElement

        m.mount(root, {
          onbeforeupdate() {
            if (
              selectedNeedleElement && 
              selectedNeedleElement !== previousNeedleElement && 
              selectedNeedleElement.textContent 
            ) {

              // make sure the current needle matches the dialog we're opening
              let needleMatch = config.searchFor
                .exec(selectedNeedleElement.textContent) // using exec b/c it gets groups even if the match is global

              // if we got a match...
              if (needleMatch) {

                // if the match has no groups, use the entire thing
                if (needleMatch.length === 1)
                  needle = needleMatch[0]

                // if the needle has groups, use the result of joining them (so you can skip characters)
                else
                  needle = needleMatch.slice(1).join('')

                textToPasteboard(needle)
              }
            }

            else 
              needle = null
          },
          view() {
            return needle ? m('.custom-context-menu', parseToolBodyConfig(config, needle)) : null
          },
          onupdate(vnode) {
            let tools = vnode.dom
            if (selectedNeedleElement && tools) {
              const needleRect = selectedNeedleElement.getBoundingClientRect()

              let cornerPadding = 2
              let top = needleRect.y + window.scrollY + needleRect.height + cornerPadding
              let left = needleRect.right + cornerPadding

              if (top !== tools.style.top || left !== tools.style.left) {
                tools.style.top = `${top}px`
                tools.style.left = `${left}px`
              }

              let toolsRect = tools.getBoundingClientRect()
              let padding = 20

              if (toolsRect.bottom > (window.innerHeight - padding)) {
                let diff = toolsRect.bottom - window.innerHeight
                tools.style.top = `${top - diff - padding}px`
              }
            }
          }
        })
      }
    }

    function markElement(element, config) {
      return (new Mark(element)).markRegExp(config.searchFor, {
        element: config.element,
        filter: element => {
          return !(
            // if the element matches any of these, stop the select
            matchesUp(element, `#${config.rootElement}`) || // inside the context menu
            matchesUp(element, '[data-markjs]') || // already selected
            matchesUp(element, '[contenteditable]') || // inside a contenteditable element
            matchesUp(element, 'textarea') // inside a text area
          )
        }
      })
    }

    function markEachMenu(element) {
      try {
        if (element && element.nodeName !== "#text") {
          eachMenu(config => markElement(element, config))
        }
      } catch (err) {
        console.debug(element)
        console.error(err)
      }

      return element
    }

    return markEachMenu
  }())

  // set up the event listeners for the menu
  document.addEventListener('mousedown', openContextMenu, true)
  document.addEventListener('contextmenu', preventDefaultOnContextMenu, true)

  // `needle` refers to the a) string pattern we're searching for
  let selectedNeedleElement // used to refer tot he currently selected 
  let lastCopiedItem

  const contextMenus = {}

  // find and mark the needles
  // rerun on every observation (if any elements got added)

  // this function gets run each time a redraw is fired
  // basically, we're making sure that the current needle is filled in in the menu
  function parseToolBodyConfig(config, needleValue) {
    return config.menu.map(item => generateItem(item, config.replace, needleValue))
  }

  // this is extracted from parseToolBodyConfig so that we can recurse on it for `script` items
  function generateItem(item, needleReplacementRegex, needleValue) {
    try {
      if (item[0] === 'title' || item[0] === 'disabled' || item[0] === 'info') {
        return m('.info', item[1].replace(needleReplacementRegex, needleValue))
      } 
      
      else if (item[0] === 'link' || item[0] === 'option')
        return m('a', {
          href: item[1].replace(needleReplacementRegex, needleValue),
          target: "_blank",
          onclick: resetContextMenu
        }, (item[2] || item[1]).replace(needleReplacementRegex, needleValue))

      else if (item[0] === 'copy')
        return m('a', {
          onclick: (event) => {
            textToPasteboard(item[1])
            lastCopiedItem = item
          }
        }, (item[2] || item[1]), lastCopiedItem === item ? ' (copied)' : '')

      else if (item[0] === 'line' || item[0] === 'separator')
        return m('hr')

      else if (item[0] === 'script') {
        let scriptResult = item[1](needleValue)
        return scriptResult ? generateItem(scriptResult, needleValue) : scriptResult
      } 
      
      else if (item[0] === 'menu') {
        console.log('menu', item, needleReplacementRegex)
        return m('.menu', 
          item[1].replace(needleReplacementRegex, needleValue), 
          m('.submenu', 
            parseToolBodyConfig({ menu: item[2], replace: needleReplacementRegex }, needleValue)
          )
        )
      }
    } catch (error) {
      console.log(item, needleValue)
      throw error
    }
  }
  // on click of a marked needle...

  // context menu action functions
  function openContextMenu(event) {
    // do stuff if we're not clicking in the context menu
    if (!matchesUp(event.target, '.custom-context-menu')) {

      // let nextTarget = markAndSearchAtCoords(event)
      let nextTarget = matchAtCoords(event, '[data-markjs]')

      if (nextTarget !== selectedNeedleElement) {
        resetContextMenu(event)

        // if it matches an account id...
        if (nextTarget && event.button === 2) {
          event.preventDefault()

          selectedNeedleElement = nextTarget
          selectedNeedleElement.classList.add('selected')

          var range = document.createRange() // create new range object
          range.selectNodeContents(selectedNeedleElement) // set range to encompass desired element text
          var selection = window.getSelection() // get Selection object from currently user selected text
          selection.removeAllRanges() // unselect any user selected text (if any)
          selection.addRange(range) // add range to Selection object to select it
        }

        m.redraw()
      }
    }
  }

  function preventDefaultOnContextMenu(event) {
    if (matchAtCoords(event, '[data-markjs]')) {
      event.preventDefault()
    }
  }

  function resetContextMenu(event) {
    if (!matchesUp(event.target, '.custom-context-menu') && selectedNeedleElement) {
      lastCopiedItem = null
      selectedNeedleElement.classList.remove('selected')
      selectedNeedleElement = null
    }
  }

  // utilities

  // checks the input element and all of it's ancestry to see if it matches the provided selector
  // if it does, returns the element; if not, returns null
  function matchesUp(initialElement, selector) {
    let upElement = initialElement

    while (upElement && (upElement.nodeName === "#text" || !upElement.matches(selector)))
      upElement = upElement.parentElement

    return upElement
  }

  function matchAtCoords(event, selector) {
    return document
      .elementsFromPoint(event.clientX, event.clientY)
      .find(element => element.matches(selector))
  }

  function textToPasteboard(text) {
    var pasteboard = document.createElement('textarea')
    document.body.appendChild(pasteboard)
    pasteboard.innerHTML = text
    pasteboard.select()
    document.execCommand('Copy')
    document.body.removeChild(pasteboard)
    return text
  }

  function eachMenu(fn, method = 'forEach') {
    return Object.entries(contextMenus)[method](([id, config], index, array) =>
      fn(config, index, array)
    )
  }
  
  // on config insertion...
  // window.setUpTooltip

  return function addContextMenu(id, config) {
    let regex = config.searchFor
    contextMenus[id] = {
      id: id,
      searchFor: new RegExp(regex, regex.flags + (regex.global ? '' : 'g')),
      replace: new RegExp('\\${' + id + '}', 'g'),
      element: id,
      rootElement: `root-element-for-${id}-menu`,
      menu: config.menu
    }

    parseToolBodyConfig(contextMenus[id], 'test')

    // markup the initial body
    markup(document.body)
  }
}());
