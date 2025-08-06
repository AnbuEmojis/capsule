import React, { Component } from "react";
import { Link } from "react-router-dom";
import Block from "./Block";


class Blocks extends Component {
    constructor(props) {
      super(props);
      this.state = {
        blocks: []
      };
    }

    componentDidMount() {
        fetch(`${document.location.origin}/api/blocks`)
        .then(response => response.json())
        .then(json => this.setState({ blocks: json }));
    }

    render() {
        return (
          <div>
            {this.state.blocks.map(block => (
              <React.Fragment key={block.hash}>
                <div className="Block">{block.someData}</div>
                <Block block={block} />
              </React.Fragment>
            ))}
          </div>
        );
      }
      
}

export default Blocks;