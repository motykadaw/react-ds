// @flow

import React from 'react';
import PropTypes from 'prop-types';

export type Point = {
  x: number,
  y: number,
}

export type Box = {
  left: number,
  top: number,
  width: number,
  height: number,
}

type Props = {
  disabled?: boolean,
  target: HTMLElement,
  onSelectionChange(elements: Array<any>): void,
  elements: Array<HTMLElement>,
  offset?: {
    // eslint-disable-next-line react/no-unused-prop-types
    top: number,
    // eslint-disable-next-line react/no-unused-prop-types
    left: number,
  },
  style: ?any,
};

type State = {
  mouseDown: boolean,
  startPoint: ?Point,
  endPoint: ?Point,
  selectionBox: ?Box,
  appendMode: boolean,
  offset: {
    top: number,
    left: number,
  },
};

function getOffset(props: Props) {
  let offset = {
    top: 0,
    left: 0,
  };
  if (props.offset) {
    offset = props.offset;
  } else if (props.target) {
    const boundingBox = props.target.getBoundingClientRect();
    offset.top = boundingBox.top + window.scrollY;
    offset.left = boundingBox.left + window.scrollX;
  }
  return offset;
}

export default class Selection extends React.PureComponent { // eslint-disable-line react/prefer-stateless-function
  props: Props;
  state: State;
  selectedChildren: Array<number>;

  constructor(props: Props) {
    super(props);

    this.state = {
      mouseDown: false,
      startPoint: null,
      endPoint: null,
      selectionBox: null,
      appendMode: false,
      offset: getOffset(props),
    };

    this.selectedChildren = [];
  }

  componentDidMount() {
    this.reset();
    this.bind();
  }

  componentWillReceiveProps(nextProps: Props) {
    this.setState({
      offset: getOffset(nextProps),
    });
  }

  componentDidUpdate() {
    this.reset();
    this.bind();
    if (this.state.mouseDown && this.state.selectionBox) {
      this.updateCollidingChildren(this.state.selectionBox);
    }
  }

  componentWillUnmount() {
    this.reset();
    window.document.removeEventListener('mousemove', this.onMouseMove);
    window.document.removeEventListener('mouseup', this.onMouseUp);
  }

  bind = () => {
    this.props.target.addEventListener('mousedown', this.onMouseDown);
    this.props.target.addEventListener('touchstart', this.onTouchStart);
  };

  reset = () => {
    if (this.props.target) {
      this.props.target.removeEventListener('mousedown', this.onMouseDown);
    }
  };

  /**
   * On root element mouse down
   * @private
   */
  onMouseDown = (e: MouseEvent) => {
    if (this.props.disabled || e.button === 2 || (e.nativeEvent && e.nativeEvent.which === 2)) {
      return;
    }

    const nextState = {};
    if (e.ctrlKey || e.altKey || e.shiftKey) {
      nextState.appendMode = true;
    }

    nextState.mouseDown = true;
    nextState.startPoint = {
      x: e.pageX - this.state.offset.left,
      y: e.pageY - this.state.offset.top,
    };

    this.setState(nextState);

    window.document.addEventListener('mousemove', this.onMouseMove);
    window.document.addEventListener('mouseup', this.onMouseUp);
  };

  onTouchStart = (e: TouchEvent) => {
    if (this.props.disabled || !e.touches || !e.touches[0] || e.touches.length > 1) {
      return;
    }

    const nextState = {};
    if (e.ctrlKey || e.altKey || e.shiftKey) {
      nextState.appendMode = true;
    }
    nextState.mouseDown = true;
    nextState.startPoint = {
      x: e.touches[0].pageX - this.state.offset.left,
      y: e.touches[0].pageY - this.state.offset.top,
    };

    this.setState(nextState);
    window.document.addEventListener('touchmove', this.onTouchMove);
    window.document.addEventListener('touchend', this.onMouseUp);
  };

  /**
   * On document element mouse up
   * @private
   */
  onMouseUp = () => {
    window.document.removeEventListener('touchmove', this.onTouchMove);
    window.document.removeEventListener('mousemove', this.onMouseMove);
    window.document.removeEventListener('mouseup', this.onMouseUp);
    window.document.removeEventListener('touchend', this.onMouseUp);

    this.setState({
      mouseDown: false,
      startPoint: null,
      endPoint: null,
      selectionBox: null,
      appendMode: false,
    });

    this.props.onSelectionChange(this.selectedChildren);
    this.selectedChildren = [];
  };

  /**
   * On document element mouse move
   * @private
   */
  onMouseMove = (e: MouseEvent) => {
    e.preventDefault();
    if (this.state.mouseDown) {
      const endPoint: Point = {
        x: e.pageX - this.state.offset.left,
        y: e.pageY - this.state.offset.top,
      };

      this.setState({
        endPoint,
        selectionBox: this.calculateSelectionBox(
          this.state.startPoint,
          endPoint
        ),
      });
    }
  };

  onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (this.state.mouseDown) {
      const endPoint: Point = {
        x: e.touches[0].pageX - this.state.offset.left,
        y: e.touches[0].pageY - this.state.offset.top,
      };

      this.setState({
        endPoint,
        selectionBox: this.calculateSelectionBox(
          this.state.startPoint,
          endPoint
        ),
      });
    }
  };

  /**
   * Calculate if two segments overlap in 1D
   * @param lineA [min, max]
   * @param lineB [min, max]
   */
  lineIntersects = (lineA: [number, number], lineB: [number, number]): boolean => (
    lineA[1] >= lineB[0] && lineB[1] >= lineA[0]
  );

  /**
   * Detect 2D box intersection - the two boxes will intersect
   * if their projections to both axis overlap
   * @private
   */
  boxIntersects = (boxA: Box, boxB: Box): boolean => {
    // calculate coordinates of all points
    const boxAProjection = {
      x: [boxA.left, boxA.left + boxA.width],
      y: [boxA.top, boxA.top + boxA.height],
    };

    const boxBProjection = {
      x: [boxB.left, boxB.left + boxB.width],
      y: [boxB.top, boxB.top + boxB.height],
    };

    return this.lineIntersects(boxAProjection.x, boxBProjection.x) &&
           this.lineIntersects(boxAProjection.y, boxBProjection.y);
  };

  /**
   * Updates the selected items based on the
   * collisions with selectionBox
   * @private
   */
  updateCollidingChildren = (selectionBox: Box) => {
    this.selectedChildren = [];
    if (this.props.elements) {
      this.props.elements.forEach((ref, $index) => {
        if (ref) {
          const refBox = ref.getBoundingClientRect();
          const tmpBox = {
            top: (refBox.top - this.state.offset.top) + window.scrollY,
            left: (refBox.left - this.state.offset.left) + window.scrollX,
            width: ref.clientWidth,
            height: ref.clientHeight,
          };

          if (this.boxIntersects(selectionBox, tmpBox)) {
            this.selectedChildren.push($index);
          }
        }
      });
    }
  };

  /**
   * Calculate selection box dimensions
   * @private
   */
  calculateSelectionBox = (startPoint: ?Point, endPoint: ?Point) => {
    if (!this.state.mouseDown || !startPoint || !endPoint) {
      return null;
    }

    // The extra 1 pixel is to ensure that the mouse is on top
    // of the selection box and avoids triggering clicks on the target.
    const left = Math.min(startPoint.x, endPoint.x) - 1;
    const top = Math.min(startPoint.y, endPoint.y) - 1;
    const width = Math.abs(startPoint.x - endPoint.x) + 1;
    const height = Math.abs(startPoint.y - endPoint.y) + 1;

    return {
      left,
      top,
      width,
      height,
    };
  };

  /**
   * Render
   */
  render() {
    const style = {
      position: 'absolute',
      background: 'rgba(159, 217, 255, 0.3)',
      border: 'solid 1px rgba(123, 123, 123, 0.61)',
      zIndex: 9,
      cursor: 'crosshair',
      ...this.state.selectionBox,
      ...this.props.style,
    };
    if (!this.state.mouseDown || !this.state.endPoint || !this.state.startPoint) {
      return null;
    }
    return (
      <div className='react-ds-border' style={ style } />
    );
  }
}

Selection.propTypes = {
  target: PropTypes.object,
  disabled: PropTypes.bool,
  onSelectionChange: PropTypes.func.isRequired,
  elements: PropTypes.array.isRequired,
  // eslint-disable-next-line react/no-unused-prop-types
  offset: PropTypes.object,
  style: PropTypes.object,
};