function addExpandedObject(obj, depth, length) {
  //if the value is in a cycle
  if(this.jsonCycleSet.has(obj)) {
    this.addTagEntry(CycleTag);
    return;
  }

  if(depth === 0) {
    this.addTagEntry(DepthBoundTag);
    return;
  }

  //Set processing as true for cycle detection
  this.jsonCycleSet.add(obj);
  this.addTagEntry(LParenTag);

  let lengthRemain = length;
  for (const p in obj) {
    if (lengthRemain <= 0) {
      this.addTagEntry(LengthBoundTag);
      break;
    }
    lengthRemain--;

    this.addPropertyEntry(p);
    this.addGeneralEntry(obj[p], depth - 1, length);
  }

  //Set processing as false for cycle detection
  this.jsonCycleSet.delete(obj);
  this.addTagEntry(RParenTag);
}