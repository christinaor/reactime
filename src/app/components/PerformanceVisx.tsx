/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  MemoryRouter as Router,
  Route,
  NavLink,
  Switch,
  useLocation,
  Redirect,
} from 'react-router-dom';
import RenderingFrequency from './RenderingFrequency';
import BarGraph from './BarGraph';
import BarGraphComparison from './BarGraphComparison';
import BarGraphComparisonActions from './BarGraphComparisonActions';
import { useStoreContext } from '../store';
import { setCurrentTabInApp } from '../actions/actions';

/* NOTES
Issue - Not fully compatible with recoil apps. Reference the recoil-todo-test.
Barstacks display inconsistently...however, almost always displays upon initial test app load or
when empty button is clicked. Updating state after initial app load typically makes bars disappear.
However, cycling between updating state and then emptying sometimes fixes the stack bars. Important
to note - all snapshots do render (check HTML doc) within the chrome extension but they do
not display because height is not consistently passed to each bar. This side effect is only
seen in recoil apps...
 */

// typescript for PROPS from StateRoute.tsx
interface BarStackProps {
  width: number;
  height: number;
  snapshots: [];
  hierarchy: any;
}

const collectNodes = (snaps, componentName) => {
  const componentsResult = [];
  const renderResult = [];
  let trackChanges = 0;
  let newChange = true;
  for (let x = 0; x < snaps.length; x += 1) {
    const snapshotList = [];
    snapshotList.push(snaps[x]);
    for (let i = 0; i < snapshotList.length; i += 1) {
      const cur = snapshotList[i];
      if (cur.name === componentName) {
        const renderTime = Number(
          Number.parseFloat(cur.componentData.actualDuration).toPrecision(5),
        );
        if (renderTime === 0) {
          break;
        } else {
          renderResult.push(renderTime);
        }
        // compare the last pushed component Data from the array to the current one to see if there are differences
        if (x !== 0 && componentsResult.length !== 0) {
          // needs to be stringified because values are hard to determine if true or false if in they're seen as objects
          if (JSON.stringify(Object.values(componentsResult[newChange ? componentsResult.length - 1 : trackChanges])[0]) !== JSON.stringify(cur.componentData.props)) {
            newChange = true;
            const props = { [`snapshot${x}`]: { ...cur.componentData.props } };
            componentsResult.push(props);
          } else {
            newChange = false;
            trackChanges = componentsResult.length - 1;
            const props = { [`snapshot${x}`]: { state: 'Same state as prior snapshot' } };
            componentsResult.push(props);
          }
        } else {
          const props = { [`snapshot${x}`]: { ...cur.componentData.props } };
          componentsResult.push(props);
        }
        break;
      }
      if (cur.children && cur.children.length > 0) {
        for (const child of cur.children) {
          snapshotList.push(child);
        }
      }
    }
  }

  const finalResults = componentsResult.map((e, index) => {
    const name = Object.keys(e)[0];
    e[name].rendertime = renderResult[index];
    return e;
  });
  return finalResults;
};

/* DATA HANDLING HELPER FUNCTIONS */
const traverse = (snapshot, data, snapshots, currTotalRender = 0) => {
  if (!snapshot.children[0]) return;

  // loop through snapshots
  snapshot.children.forEach((child, idx) => {
    const componentName = child.name + -[idx + 1];

    // Get component Rendering Time
    const renderTime = Number(
      Number.parseFloat(child.componentData.actualDuration).toPrecision(5),
    );
    // sums render time for all children
    currTotalRender += renderTime;
    // components as keys and set the value to their rendering time
    data.barStack[data.barStack.length - 1][componentName] = renderTime;

    // Get component stateType
    if (!data.componentData[componentName]) {
      data.componentData[componentName] = {
        stateType: 'stateless',
        renderFrequency: 0,
        totalRenderTime: 0,
        rtid: '',
        information: {},
      };
      if (child.state !== 'stateless') data.componentData[componentName].stateType = 'stateful';
    }
    // increment render frequencies
    if (renderTime > 0) {
      data.componentData[componentName].renderFrequency += 1;
    }

    // add to total render time
    data.componentData[componentName].totalRenderTime += renderTime;
    // Get rtid for the hovering feature
    data.componentData[componentName].rtid = child.rtid;
    data.componentData[componentName].information = collectNodes(snapshots, child.name);
    traverse(snapshot.children[idx], data, snapshots, currTotalRender);
  });
  // reassigns total render time to max render time
  data.maxTotalRender = Math.max(currTotalRender, data.maxTotalRender);
  return data;
};

// Retrieve snapshot series data from Chrome's local storage.
const allStorage = () => {
  let values = localStorage.getItem('project');
  values = values === null ? [] : JSON.parse(values);
  return values;
};

// Gets snapshot Ids for the regular bar graph view.
const getSnapshotIds = (obj, snapshotIds = []): string[] => {
  snapshotIds.push(`${obj.name}.${obj.branch}`);
  if (obj.children) {
    obj.children.forEach(child => {
      getSnapshotIds(child, snapshotIds);
    });
  }
  return snapshotIds;
};

// Returns array of snapshot objs each with components and corresponding render times.
const getPerfMetrics = (snapshots, snapshotsIds): {} => {
  const perfData = {
    barStack: [],
    componentData: {},
    maxTotalRender: 0,
  };
  snapshots.forEach((snapshot, i) => {
    perfData.barStack.push({ snapshotId: snapshotsIds[i], route: snapshot.route.url });
    traverse(snapshot, perfData, snapshots);
  });
  return perfData;
};

/* EXPORT COMPONENT */
const PerformanceVisx = (props: BarStackProps) => {
  // hook used to dispatch onhover action in rect
  const {
    width, height, snapshots, hierarchy,
  } = props;
  const [{ tabs, currentTab, currentTabInApp }, dispatch] = useStoreContext();
  const NO_STATE_MSG = 'No state change detected. Trigger an event to change state';
  const data = getPerfMetrics(snapshots, getSnapshotIds(hierarchy));
  const [series, setSeries] = useState(true);
  const [action, setAction] = useState(false);

  const [route, setRoute] = useState('All Routes');

  useEffect(() => {
    dispatch(setCurrentTabInApp('performance'));
  }, [dispatch]);

  // Creates the actions array used to populate the compare actions dropdown
  const getActions = () => {
    let seriesArr = localStorage.getItem('project');
    seriesArr = seriesArr === null ? [] : JSON.parse(seriesArr);
    const actionsArr = [];

    if (seriesArr.length) {
      for (let i = 0; i < seriesArr.length; i += 1) {
        for (const actionObj of seriesArr[i].data.barStack) {
          if (actionObj.name === action) {
            actionObj.seriesName = seriesArr[i].name;
            actionsArr.push(actionObj);
          }
        }
      }
    }
    return actionsArr;
  };

  const renderComparisonBargraph = () => {
    if (hierarchy && series !== false) {
      return (
        <BarGraphComparison
          comparison={allStorage()}
          data={data}
          width={width}
          height={height}
          setSeries={setSeries}
          series={series}
          setAction={setAction}
        />
      );
    }
    return (
      <BarGraphComparisonActions
        comparison={allStorage()}
        data={getActions()}
        width={width}
        height={height}
        setSeries={setSeries}
        action={action}
        setAction={setAction}
      />
    );
  };

  const allRoutes = [];
  const filteredSnapshots = [];

  for (let i = 0; i < data.barStack.length; i += 1) {
    const url = new URL(data.barStack[i].route);
    if (!allRoutes.includes(url.pathname)) {
      allRoutes.push(url.pathname);
    }
    if (route && route === url.pathname) {
      filteredSnapshots.push(data.barStack[i]);
    }
  }
  if (route !== 'All Routes') {
    data.barStack = filteredSnapshots;
  }
 
  const renderBargraph = () => {
    if (hierarchy) {
      return (
        <div>
          <BarGraph
            data={data}
            width={width}
            height={height}
            comparison={allStorage()}
            setRoute={setRoute}
            allRoutes={allRoutes}
            filteredSnapshots={filteredSnapshots}
          />
        </div>
      );
    }
  };

  const renderComponentDetailsView = () => {
    if (hierarchy) {
      return <RenderingFrequency data={data.componentData} />;
    }
    return <div className="noState">{NO_STATE_MSG}</div>;
  };

  // This will redirect to the proper tabs during the tutorial
  const renderForTutorial = () => {
    if (currentTabInApp === 'performance') return <Redirect to="/" />;
    if (currentTabInApp === 'performance-comparison') return <Redirect to="/comparison" />;
    return null;
  };

  return (
    <Router>
      <div className="performance-nav-bar-container">
        <NavLink
          className="router-link-performance"
          activeClassName="is-active"
          exact
          to="/"
        >
          Snapshots View
        </NavLink>
        <NavLink
          className="router-link-performance"
          id="router-link-performance-comparison"
          activeClassName="is-active"
          to="/comparison"
        >
          Comparison View
        </NavLink>
        <NavLink
          className="router-link-performance"
          activeClassName="is-active"
          to="/componentdetails"
        >
          Component Details
        </NavLink>
      </div>

      {renderForTutorial()}

      <Switch>
        <Route path="/comparison" render={renderComparisonBargraph} />
        <Route path="/componentdetails" render={renderComponentDetailsView} />
        <Route path="/" render={renderBargraph} />
      </Switch>
    </Router>
  );
};

export default PerformanceVisx;
