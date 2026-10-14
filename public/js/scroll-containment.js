// Native WebKit on macOS may chain wheel scroll to the page when a popover's
// internal list reaches either end, even with overscroll-behavior: contain.
// Block only the boundary delta. Never interfere with pinch zoom, middle-of-list
// scrolling, unrelated popovers or keyboard events.
export function containPopoverWheel(popover, event, listSelector = '.pop-list') {
  if (!popover || popover.hidden || event.ctrlKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return false;
  const targetList = event.target?.closest?.(listSelector);
  const list = targetList && popover.contains(targetList) ? targetList : null;
  if (!list) {
    event.preventDefault();
    return true;
  }
  const top = list.scrollTop <= 1;
  const bottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  if ((event.deltaY < 0 && top) || (event.deltaY > 0 && bottom)) {
    event.preventDefault();
    return true;
  }
  return false;
}
