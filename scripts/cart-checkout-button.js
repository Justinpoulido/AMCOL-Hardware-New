(function () {
  "use strict";

  var CART_KEY = "amcolCartItems";

  function readCartItems() {
    try {
      var items = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (error) {
      return [];
    }
  }

  function cartItemCount() {
    return readCartItems().reduce(function (count, item) {
      return count + Math.max(1, Number(item.quantity) || 1);
    }, 0);
  }

  function syncCheckoutButton() {
    var button = document.querySelector("[data-proceed-checkout]");
    var count = cartItemCount();

    if (!button && count > 0) {
      button = document.createElement("a");
      button.className = "floating-checkout-button";
      button.href = "cart.html#checkoutPanel";
      button.dataset.proceedCheckout = "true";
      document.body.appendChild(button);
    }

    if (!button) return;

    button.hidden = count === 0;
    button.textContent = "Proceed to checkout";
    button.setAttribute("aria-label", "Proceed to checkout with " + count + " " + (count === 1 ? "item" : "items"));
  }

  document.addEventListener("DOMContentLoaded", syncCheckoutButton);
  window.addEventListener("storage", function (event) {
    if (event.key === CART_KEY) syncCheckoutButton();
  });
})();
