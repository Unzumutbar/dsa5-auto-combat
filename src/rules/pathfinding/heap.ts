/** Small binary min-heap keyed by a numeric priority. */
export class MinHeap<T> {
  #items: {priority: number; value: T}[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(value: T, priority: number): void {
    const items = this.#items;
    items.push({priority, value});
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]!.priority <= items[index]!.priority) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }

  pop(): T | undefined {
    const items = this.#items;
    if (items.length === 0) return undefined;
    const top = items[0]!.value;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left]!.priority < items[smallest]!.priority) smallest = left;
        if (right < items.length && items[right]!.priority < items[smallest]!.priority) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top;
  }
}
