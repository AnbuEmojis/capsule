
import React, { Component } from "react";
import { FormGroup, FormControl, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import history from '../history'

class ConductTransaction extends Component {
    constructor(props) {
      super(props);
      this.state = {
        recipient: '',
        amount: 0
      };
  
      // Bind methods
      this.updateRecipient = this.updateRecipient.bind(this);
      this.updateAmount = this.updateAmount.bind(this);
      this.conductTransaction = this.conductTransaction.bind(this);
    }
  
    updateRecipient(event) {
      this.setState({ recipient: event.target.value });
    }
  
    updateAmount(event) {
      this.setState({ amount: Number(event.target.value) });
    }
  
    conductTransaction() {
      const { recipient, amount } = this.state;

        fetch(`${document.location.origin}/api/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient, amount })
        }).then(response => response.json())
        .then(json => {
            alert(json.message || json.type);
            history.push('/transaction-pool');
        });
    }

    render() {
        return(
            <div className='ConductTransaction'>
                <Link to='/'>Home</Link>
                <h3>Conduct Transaction</h3>
                <FormGroup>
                    <FormControl 
                        input='text'
                        placeholder='recipient'
                        value={this.state.recipient}
                        onChange={this.updateRecipient}
                    />
                </FormGroup>
                <br />
                <FormGroup>
                <FormControl 
                        input='number'
                        placeholder='amount'
                        value={this.state.amount}
                        onChange={this.updateAmount}
                    />
                </FormGroup>
                <div>
                    <Button
                    bsStyle="danger"
                    onClick={this.conductTransaction}
                    >
                        Submit
                    </Button>
                </div>
            </div>
        )
    }
}

export default ConductTransaction;