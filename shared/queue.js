// shared/queue.js

const queue = [];

export function push(task) {
  queue.push(task);
}

export function pop() {
  return queue.shift();
}