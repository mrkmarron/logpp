function processMsgs(pos, buff, dest, age, size) {
  let now = new Date();
  let cpos = pos;
  while(cpos < buff.entryCount()) {
    if(!ageCheck(buff, cpos, now, age) ||
       !sizeCheck(buff, cpos, size)) {
      return;
    }

    if(!isEmitLevelEnabled(buff.data[cpos])) {
      cpos = scanAndDiscardMsg(buff, cpos);
    }
    else {
      cpos = copyMsg(buff, cpos, dest);
    }
  }
}