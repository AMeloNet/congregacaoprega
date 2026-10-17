import '@testing-library/jest-dom/vitest';

// jsdom has no native dialog implementation. Browser journeys cover actual
// modality, Escape, backdrop interaction and focus containment.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event('close'));
};
