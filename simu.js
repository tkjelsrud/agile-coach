result = {'days': 0, 'tasks': 0, 'first': 0, 'team': 0, 'capacity': 0, 'utilization': 0, 'factor': 0, 'cost': 0};

function Task(idx, size) {
  this.id = idx;
  this.type = 'task';
  this.label = '';
  this.log = new Array();
  this.daysLeft = size;
  this.startDay = 0;
  this.colDone = {};
  this.addToLog = function(wf) {
    this.log.push(wf);
  };
  this.getStatus = function() {
    cx = "";
    for(c in this.colDone)
      cx += c + ":" + this.colDone[c];
    return "id:" + this.id + " start:" + this.startDay + " " + cx;
  }
}

$(window).keypress(function(e) {
    if (e.which === 32) {
        if(simu.status == 'run')
          pauseSimulation();
        else if(simu.status == 'pause')
          startSimulation();
    }
});

function setupSimulation() {
  $('.columns').empty();
  for(i = 0; i < simu.workflow.length; i++) {
    $('.columns').append('<div class="column" id="' + simu.workflow[i].id  + '"><div class="info">&nbsp;</div><div class="in">&nbsp;</div><div class="out">&nbsp;</div><div class="wait">&nbsp;</div><div class="counter">&nbsp;</div></div>');

    $('#' + simu.workflow[i].id + ' .info').html('<span class="label">&nbsp;</span> ppl <span class="cap" contenteditable="true">&nbsp;</span> lt <span class="lt" contenteditable="true">&nbsp;</span> wip (<span class="wip" contenteditable="true">&nbsp;</span>)');
    $('#' + simu.workflow[i].id + ' .label').html(simu.workflow[i].name);
    //$('#' + simu.workflow[i].id + ' .cap').html(simu.workflow[i].cap);
    $('#' + simu.workflow[i].id + ' .wip').html(simu.workflow[i].wip);
    lt = (simu.workflow[i].lt > 0 ? simu.workflow[i].lt : 0);
    $('#' + simu.workflow[i].id + ' .lt').html(lt);
    $('#' + simu.workflow[i].id + ' .counter').html('0');
    $('#' + simu.workflow[i].id + ' .wait').html('0%');

    tm = 0;
    if(simu.team[simu.workflow[i].name] > 0)
      tm = simu.team[simu.workflow[i].name];
    $('#' + simu.workflow[i].id + ' .cap').html(tm);
  }
}

function resetSimulation() {
  // Empty columns
  simu.status = 'stop';
  simu.tick = 0;
  simu['newId'] = 0;

  resetQueues();
  resetResult();

  $('.postit').remove();
}

function startSimulation() {
  // Read all simulation values
  if(simu.status == 'stop') {
    resetSimulation();
  }
  simu.status = 'run';
  for(i = 0; i < simu.workflow.length; i++) {
    simu.workflow[i].wip = parseInt($('#' + simu.workflow[i].id + ' .wip').html());
    simu.workflow[i].lt = parseInt($('#' + simu.workflow[i].id + ' .lt').html());
    simu.workflow[i].cap = parseInt($('#' + simu.workflow[i].id + ' .cap').html());
  }

  setTimeout(timer, simu.speed);
}

function pauseSimulation() {
  simu.status = 'pause';
}

function stopSimulation() {
  // Calc results
  result.days = simu.tick;
  result.tasks = lastColumn().out.length;
  result.team = 0;

  for(i = 0; i < simu.workflow.length; i++)
    result.team += simu.workflow[i].cap;

  result.utilization = (result.capacity / (result.team * result.days)).toFixed(2);
  result.factor = (result.factor / (result.team * result.days)).toFixed(2);
  result.cost = (simu.costDay * result.days * result.team).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  color = (isSimuDone() ? '#999' : 'red');

  simLog('<div style="clear:both">' + simu.desc + '</div><div style="color:' + color + '"">' + result.days + "</div><div>" + result.tasks +
         "</div><div>" + result.first + "</div><div>" + result.team + "</div><div>" + result.utilization + "</div><div>" +
         result.factor + "</div><div>" + result.cost + "</div>");

  renderGraph();

  resetResult();
  resetQueues();

  simu.tick = -1;
  simu.status = 'stop';
}

function timer() {
  if(simu.tick != -1 && simu.status == 'run') {
    tickSimulation();
    if(!isSimuDone())
      setTimeout(timer, simu.speed);
    else
      stopSimulation();
  }
  $('#count').html(simu.tick);
}

function tickSimulation() {
  if(simu.tick == simu.refresh.tickMod || simu.tick % simu.refresh.tickMod == 0) {
    // Time to refresh
    addTasks();
  }

  // Calculate progress in column
  for(i = simu.workflow.length - 1; i >= 0; i--) {
    col = simu.workflow[i];
    //console.log("Selected " + col + " " + i);
    visuShowCount(col, col.in.length + col.out.length);

    if(col.out.length > 0) {
      // Pull - factor in hand-over time?
      nextCol = (i + 1 <= simu.workflow.length ? simu.workflow[i + 1] : false);
      if(nextCol && nextCol.in.length < nextCol.wip) {
        t = col.out.shift();
        if(Array.isArray(t)) console.log("A array");
        //console.log("out" + JSON.stringify(t));
        t.daysLeft = nextCol.lt;// + (nextCol.in.length / 10 * nextCol.lt);

        if(simu.workFactor.taskVariation != 1) {
          modifier = Math.floor(Math.random() * t.daysLeft * simu.workFactor.taskVariation) - (t.daysLeft / 2 * simu.workFactor.taskVariation);
          //console.log(t.daysLeft + " " + modifier);
          t.daysLeft += modifier;
        }

        t.moveDay = simu.tick;
        t.colDone[col.name] = simu.tick;
        nextCol.in.push(t); // TAX? + (nextCol.tDays * (nextCol.in.length / 10)));
        visuTransitionNote(t, col, nextCol);
      }
      if(!nextCol && !result.first) {
        result.first = simu.tick;
      }
    }

    // TODO: refactor, we burn down based on total team, then within the columns
    // TODO: Implemented the shared team (common)

    if(col.in.length > 0) {
      // Number of work days capacity to deliver this day
      team = (simu.team[col.name] > 0 ? simu.team[col.name] : 0);
      wd = Math.min(Math.min(team, col.in.length), col.wip);
      result.capacity += wd;
      // Work factor, decreases as team size increases, 0-1.0 where 1.0 = 100% efficient
      wf = 1.0;
      if(simu.workFactor.sizeTax == 'loga')
        wf = (wd > 1 ? 1 / Math.log(wd + 1) : 1.0);
      //console.log(wd + ' ' + wf);

      visuShowWait(col, Math.round(100 * (1 - wf)));

      //console.log(col.id + " " + team + " " + wd);

      result.factor += (wd * wf);
      for(j = 0; j < wd; j++) {
        tx = Math.floor(Math.random() * Math.min(col.in.length, col.wip));
        t = col.in[tx];
        //if(Array.isArray(t)) console.log("B array");
        t.daysLeft -= wf;
        //console.log(JSON.stringify(t));

        visuWorkNote(t); //, tx, col.in[tx]);
      }
      for(j = col.in.length - 1; j >= 0; j--) {
        if(col.in[j].daysLeft <= 0.0) {
          t = col.in.splice(j, 1)[0];
          col.out.push(t);
          visuBurnNote(t, col);
        }
      }
    }
  }

  simu.tick++;
}

/*function getCapacity(team, task) {
  cap = 0;
  for(t in team) {
    cap += team[t];
  }
}*/

function lastColumn() {
  return simu.workflow[simu.workflow.length - 1];
}

function resetResult() {
  for(x in result)
    result[x] = 0;
}

function resetQueues() {
  for(i = 0; i < simu.workflow.length; i++) {
    simu.workflow[i].in = new Array();
    simu.workflow[i].out = new Array();
  }
}

function isSimuDone() {
  if(simu.tick >= simu.refresh.time)
    return true;
  num = 0;
  for(i = 0; i < simu.workflow.length; i++) {
    num += simu.workflow[i].in.length;
    if(i < simu.workflow.length - 1)
      num += simu.workflow[i].out.length;
  }
  return (num == 0);
}

function addTasks() {
  for(i = 0; i < simu.refresh.size; i++) {
    t = new Task(simu.newId++, simu.workflow[0].lt);
    t.startDay = simu.tick;
    if(i == 0)
      t.label = 'first';
    if(i == simu.refresh.size -1)
      t.label = 'last';
    simu.workflow[0].out.push(t);
    visuNewNote(t, simu.workflow[0], 'out');
  }
}

function updateColumn(col) {
  //$('#' + col.id).html('in: ' + col.in.length + ' out:' + col.out.length);
}

/*function propsToString(props) {
  st = "";
  for(p in props)
    if(!(typeof props[p] === "function"))
      st += p + ":" + props[p] + "\n";
  return st;
}*/

function visuNewNote(t, col, inout) {
  // Visualize a new note'
  $('#' + col.id + ' .' + inout).append('<div id="t' + t.id + '" class="postit ' + t.label + '" title="' + t.getStatus() + '">' + Math.floor(t.daysLeft) + '</div>').fadeIn('slow');
}

function visuBurnNote(t, col) {
  $($('#t' + t.id)[0]).remove();
  visuNewNote(t, col, 'out');
}

function visuTransitionNote(t, colA, colB) {
  $('#t' + t.id).remove();
  visuNewNote(t, colB, 'in');
  //$('#' + colB.id + ' .in').append('<div class="postit">' + colB.tDays + '</div>').fadeIn('slow');
}

function visuWorkNote(t) {
  $('#t' + t.id).html(Math.round(t.daysLeft));
}

function visuShowCount(col, cnt) {
  $('#' + col.id + ' .counter').html(cnt);
}

function visuShowWait(col, wait) {
  //wt = Math.round((result.factor / result.capacity) * 100);
  $('#' + col.id + ' .wait').html(wait + '%');

}

function simLog(msg) {
  $('#simuout').append(msg);
}

function renderGraph() {
  // Plot all finished tasks on timeline
  // sort the entries by first done (que actual sorting)
  // create a bar with height of total time in transit
  $('#graph').empty();

  arr = new Array();

  for(i = 0; i < lastColumn().out.length; i++) {
    t = lastColumn().out[i];
    start = 999;
    end = 0;
    for(c in t.colDone) {
      if(t.colDone[c] < start)
        start = t.colDone[c];
      if(t.colDone[c] > end)
        end = t.colDone[c];
    }
    arr.push(end - start);
  }
  arr.sort(sortNumber);

  for(i = 0; i < arr.length; i++) {
    $('#graph').append('<div class="bar" style="left:' + (i*6) + 'px;height:' + arr[i] + 'px" />');
  }

}

function sortNumber(a,b) {
  return a - b;
}
