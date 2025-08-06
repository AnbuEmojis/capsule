import React, { Component } from "react";
import { Button } from "react-bootstrap";
import Transaction from "./Transaction";

class Block extends Component {
  constructor(props) {
    super(props);
    this.state = {
      displayTransaction: false,
    };

    this.toggleTransaction = this.toggleTransaction.bind(this);
  }

  toggleTransaction() {
    this.setState({ displayTransaction: !this.state.displayTransaction });
  }

  renderTransactionData() {
    const { data } = this.props.block;
    const stringifiedData = JSON.stringify(data);

    const dataDisplay =
      stringifiedData.length > 24
        ? `${stringifiedData.substring(0, 24)}...`
        : stringifiedData;

    if (this.state.displayTransaction) {
      return (
        <div>
          {data.map((transaction) => (
            <div key={transaction.id}>
              <hr />
              <Transaction transaction={transaction} />
            </div>
          ))}
          <br />
          <Button variant="danger" size="sm" onClick={this.toggleTransaction}>
            Close Cap
          </Button>
        </div>
      );
    }

    return (
      <div>
        <div>Data: {dataDisplay}</div>
        <Button variant="danger" size="sm" onClick={this.toggleTransaction}>
          See Capsule
        </Button>
      </div>
    );
  }

  render() {
    const { timestamp, hash, data } = this.props.block;
  
    const hashDisplay = `${hash.substring(0, 19)}...`;
    const transactionCount = data.length;
  
    const stringifiedData = JSON.stringify(data);
    const dataDisplay =
      stringifiedData.length > 24
        ? `${stringifiedData.substring(0, 24)}...`
        : stringifiedData;
  
    return (
      <div className="Block">
      <div>
        <div>Transactions in block: {transactionCount}</div>
      </div>
        <div>Hash: {hashDisplay}</div>
        <div>Timestamp: {new Date(timestamp).toLocaleString()}</div>
        <div>Data: {dataDisplay}</div>
        {this.renderTransactionData()}
      </div>
    );
  }
  
}

export default Block;