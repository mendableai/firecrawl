export async function batchProcess<T>(
    array: T[],
    batchSize: number,
    asyncFunction: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      batches.push(batch);
    }
  
    for (const batch of batches) {
      await Promise.all(batch.map((item, i) => asyncFunction(item, i)));
    }
  }
  