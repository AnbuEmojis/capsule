import React from "react";
import PropTypes from 'prop-types';
import { MINING_REWARD, TOKEN_BALANCE } from "../../../config";

const Transaction = ({ transaction }) => {
    if (!transaction) return null;
  
    const { input = {}, outputMap = {} } = transaction;
    const recipients = Object.keys(outputMap);
  
    return (
      <div className="Transaction">
        <div>
          From: {input.address ? `${input.address.substring(0, 19)}...` : 'Unknown'} | Balance: {input.amount || (MINING_REWARD)}
        </div>
        {recipients.map(recipient => (
          <div key={recipient}>
            To: {`${recipient.substring(0, 19)}...`} | Sent: {outputMap[recipient]}
          </div>
        ))}
      </div>
    );
  }

Transaction.propTypes = {
  transaction: PropTypes.shape({
    input: PropTypes.shape({
      address: PropTypes.string,
      amount: PropTypes.number,
    }),
    outputMap: PropTypes.objectOf(PropTypes.number)
  }),
};

export default Transaction;