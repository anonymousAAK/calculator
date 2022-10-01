var buttons = document.getElementsByClassName("button");
var todis = document.getElementById("display");
var operand1 = 0;
var operand2 = null;
var operator = null;
var prev = null;

function calculate(o1,o2,or){
  if(or == '+'){
    var answer = o1+o2;
    todis.innerText = answer;
  }else if(or == '-'){
    var answer = o1-o2;
    todis.innerText = answer;
  }else if(or == '*'){
    var answer = o1*o2;
    todis.innerText = answer;
  }else if(or == '/') {
    var answer = o1/o2;
    todis.innerText = answer;
  }else if(or == '/100'){
    var answer = o1/o2;
    todis.innerText = answer;
  }else if(or == '%'){
  var answer = o1%o2;
  todis.innerText = answer;
}
  
}

for(var i = 0; i < buttons.length; i++){
  buttons[i].addEventListener('click',function(){
    var value = this.getAttribute('data-value');
    console.log(value);
    
    if(value == '+'){
      operand1 = parseFloat(todis.innerText);
      operator = '+';
      todis.innerText = '';
      
    }else if(value == '='){
      operand2 = parseFloat(todis.innerText);
      calculate(operand1,operand2,operator);

    }else if(value =='-'){
      operator = '-';
      operand1 = parseFloat(todis.innerText);
      todis.innerText = '';

    }else if(value == 'clear'){
      operand1 = 0;
      operand2 = 0;
      todis.innerText = '';

    }else if(value =='*'){
      operator = '*';
      operand1 = parseFloat(todis.innerText);
      todis.innerText = '';

    }else if(value =='/'){
      operator = '/';
      operand1 = parseFloat(todis.innerText);
      todis.innerText = '';

    }else if(value =='/'){
      operator = '/';
      operand1 = parseFloat(todis.innerText);
      todis.innerText = '';

    }else if(value =='/'){
      operator = '/';
      operand1 = parseFloat(todis.innerText);
      todis.innerText = '';

    }else if(value =='/100'){
      operator = '/';
      operand1 = parseFloat(todis.innerText);
      operand2 = 100;
      todis.innerText = '';
      calculate(operand1,operand2,operator);

    }else if(value =='del'){
    prev = todis.innerText;
    prev = prev.substring(0,prev.length-1);
    todis.innerText = prev;

  }else if(value =='%'){
    operator = '%';
    operand1 = parseFloat(todis.innerText);
    todis.innerText = '';

    }else{
      todis.innerText += value;
    }
    
  });



}