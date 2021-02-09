// ==UserScript==
// @name        Remove "Promoted by" posts on pinterest
// @description This is your new userscript, start writing code
// @match       *://www.pinterest.com/*
// @inject-into auto
// @require     https://unpkg.com/@testing-library/dom@7.29.4/dist/@testing-library/dom.umd.min.js
// ==/UserScript==

(function () {
  function findUp(element, selector) {
    while (element) {
      if (element.matches(selector)) {
        break;
      }
      element = element.parentElement
    }
    return element
  }

  document.addEventListener('scroll', function () {
    throttledRemover()
  })

  async function findAndRemovePromoted() {
    let allPromotedBys = []
    let done = true

    try {
      allPromotedBys = await TestingLibraryDom.findAllByText(document.body, 'Promoted by')
    } catch (e) {
    }

    allPromotedBys
      .forEach(promotedBy => {
        let parent = findUp(promotedBy, '[data-grid-item]')
        if (parent.style.display !== "none") {
          done = false
          parent.style.display = "none"
        }
      })

    return done
  }

  function doUntilDone(fnToDo, timeout = 60*1000, interval = 50) {
    return new Promise((resolve, reject) => {
      let repeat = setInterval(() => {
        let isDone = fnToDo()
        if (isDone) {
          clearInterval(repeat)
          resolve()
        }
      }, interval)

      setTimeout(() => {
        clearInterval(repeat)
        reject()
      }, timeout);
    })
  }

  function throttle(fn, rate = 300) {
    let queue = []
    let chain = Promise.resolve()

    return () => {
      if (queue.length === 0 || queue.length === 1) {
        queue.push(fn)

        chain = chain
          .then(async () => {
            fn()
            await wait(rate)
            queue.shift()
          })
      }

      return chain
    }
  }

  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms))}

  const throttledRemover = throttle(() => {
    return doUntilDone(findAndRemovePromoted)
  }, 1000)

  throttledRemover()
}())
