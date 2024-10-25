import LazyInput from "../../../components/catalog/ComponentLazyInput"
// import relateToManyTableModal from "./relateToManyTableModal"
import relateToSingleTableModal from "./relateToSingleTableModal"
import tableInfoModal from "./tableInfoModal"
import {extend} from "quasar-framework/src/utils"
import tableNodeContextMenu from "./compTableNodeContextMenu"
import {OperateTypeEnum} from "../../../utils/enum/erDiagram/tableRelationTypeEnum"
import {ErTableTypeEnum} from "../../../utils/enum/erDiagram/erTableTypeEnum"

const colors = {
  'red': '#be4b15',
  'green': '#52ce60',
  'blue': '#6ea5f8',
  'lightred': '#fd8852',
  'lightblue': '#afd4fe',
  'lightgreen': '#b9e986',
  'pink': '#faadc1',
  'purple': '#d689ff',
  'yellow': '#fdb400',
  'lightgrey': '#efefef',
  'drakblue': '#1967B3'
}

export default {
  name: 'erDiagram',
  props: {
    tableList: {type: Array, default: () => []},
    relationList: {type: Array, default: () => []},
    disable: {type: Boolean, default: false},
    hasRdsDbPermission: {type: Boolean, default: false},
    round: {type: Boolean, default: true},
    rdsDb: {type: String},
    rdsClusterId: {type: String},
    tabInfo: {type: Object}
  },
  data() {
    return {
      myDiagram: '',
      myOverview: '',
      searchText: '',
      // 表数据
      nodeDataArray: [],
      // 表关系数据
      linkDataArray: [],
      operateWarning: `只读模式不支持此操作！`,
      cxElement: null,
      contextNodeObj: null
    }
  },
  computed: {
    showErDiagramView() {
      return this.nodeDataArray && this.nodeDataArray.length
    }
  },
  watch: {
    // node data array
    tableList: {
      deep: true,
      handler: function (nv, ov) {
        if (nv) {
          this.handleNodeData(nv)
          this.init()
        }
      }
    },
    // link data array
    relationList: {
      deep: true,
      handler: function (nv, ov) {
        if (nv) {
          this.handleLinkData()
          this.init()
        }
      }
    }
  },
  methods: {
    // init diagram related
    init() {
      this.myDiagram && (this.myDiagram.div = null)
      this.myOverview && (this.myOverview.div = null)

      if (window.goSamples)
        goSamples(); // init
      let $ = go.GraphObject.make; // 定义模板
      this.myDiagram = $(go.Diagram, 'entityRelation', // 必须命名或引用div html元素 id
        {
          initialContentAlignment: go.Spot.Center,
          // allowDelete: true,
          // allowCopy: true,
          // allowMove: true,
          // "grid.visible": true,     // 背景网格
          scale: 0.8,
          validCycle: go.Diagram.CycleNotDirected,  // don't allow loops
          layout: $(go.ForceDirectedLayout, {
            isInitial: false,
            isOngoing: false
            // defaultSpringLength: 50,
            // defaultElectricalCharge: 20
          }),
          "undoManager.isEnabled": false,
          ModelChanged: e => {
            if (e.isTransactionFinished) {
            }
          },
          "InitialLayoutCompleted": function (e) {
            // if not all Nodes have real locations, force a layout to happen
            if (!e.diagram.nodes.all(function (n) {
              return n.location.isReal();
            })) {
              e.diagram.layoutDiagram(true);
            }
          }
        });

      let myContextMenu = this.initCustomNodeContextMenu($)

      this.initNodeTemplate($, myContextMenu)

      this.initLinkTemplate($)

      this.initDiagramEventListener()

      this.initDiagramData($)
      // Overview
      this.myOverview = $(go.Overview, "myOverviewDiv", // the HTML DIV element for the Overview
        {observed: this.myDiagram, contentAlignment: go.Spot.Center});

      // this.myDiagram.layout.isOngoing = false
      // this.myDiagram.layout.isInitial = false
    },
    initCustomNodeContextMenu($) {
      // 自定义右键菜单
      this.cxElement = document.getElementById("Menu");
      // an HTMLInfo object is needed to invoke the code to set up the HTML cxElement
      let myContextMenu = $(go.HTMLInfo, {
        show: this.showContextMenu,
        hide: () => this.cxElement.style.display = "none",
      });
      // We don't want the div acting as a context menu to have a (browser) context menu!
      this.cxElement.addEventListener("contextmenu", e => {
        e.preventDefault();
        return false;
      }, false);

      return myContextMenu
    },
    showContextMenu(obj, diagram, tool) {
      this.cxElement.style.display = "block"
      // we don't bother overriding positionContextMenu, we just do it here:
      let mousePt = diagram.lastInput.viewPoint;
      this.cxElement.style.left = mousePt.x + 5 + "px";
      this.cxElement.style.top = mousePt.y + "px";

      this.contextNodeObj = obj
    },
    initNodeTemplate($, myContextMenu) {
      let itemTemplate = this.initNodeItemTemplate($)

      this.myDiagram.nodeTemplate = $(go.Node, "Auto",
        {
          selectable: !this.disable,
          locationSpot: go.Spot.Center,
          copyable: false,
          deletable: !this.disable,
          // fromLinkable: !this.disable,   // 支持链接
          // toLinkable: !this.disable,
          contextMenu: myContextMenu,
          layoutConditions: go.Part.LayoutStandard & ~go.Part.LayoutNodeSized,
          // avoidableMargin: new go.Margin(6, 10, 6, 10)
        },
        // 绑定节点坐标Node.location为Node.data.loc的值 Model对象可以通过Node.data.location 获取和设置Node.location（修改节点坐标）
        new go.Binding("location", "location", go.Point.parse).makeTwoWay(go.Point.stringify),
        // 边框
        $(go.Shape, this.round ? "Rectangle" : "Rectangle", // RoundedRectangle
          {stroke: colors.blue, strokeWidth: 1},
          new go.Binding("fill", "isHighlighted", function (h) {
            return h ? colors.lightblue : colors.lightgrey;
          }).ofObject()),
        // the content consists of a header and a list of items
        $(go.Panel, "Vertical",
          // 头部
          $(go.Panel, "Auto",
            {stretch: go.GraphObject.Horizontal},  // as wide as the whole node
            $(go.Shape,
              {fill: colors.blue, stroke: null}),
            $(go.TextBlock,
              {
                row: 0,
                alignment: go.Spot.Left,
                margin: new go.Margin(0, 2, 0, 4), // leave room for Button
                stroke: colors.red,
                font: "bold 16px sans-serif"
              },
              new go.Binding("text", "tableTag")),
            $(go.TextBlock,
              {
                alignment: go.Spot.Center,
                margin: 2,
                stroke: "white",
                textAlign: "center",
                font: "bold 14px sans-serif",
                wrap: go.TextBlock.None
              },
              new go.Binding("text", "key"))),
          // this Panel holds a Panel for each item object in the itemArray;
          // each item Panel is defined by the itemTemplate to be a TableRow in this Table
          $(go.Panel, "Table",
            {
              padding: 2,
              minSize: new go.Size(100, 10),
              defaultStretch: go.GraphObject.Horizontal,
              itemTemplate: itemTemplate
            },
            new go.Binding("itemArray", "items")
          )  // end Table Panel of items
        ),  // end Vertical Panel
        // 事件
        {
          doubleClick: (e, node) => {
            let operateNode = this.nodeDataArray.find(nodeData => nodeData.key == node.key)
            this.showTableInfo(operateNode)
          }
        },
      );  // end Node
    },
    initNodeItemTemplate($) {
      // the template for each attribute in a node's array of item data
      let itemTempl =
        $(go.Panel, "TableRow",
          {
            background: "transparent",  // so this port's background can be picked by the mouse
            fromSpot: go.Spot.LeftRightSides,  // links only go from the right side to the left side
            toSpot: go.Spot.LeftRightSides,
            // defaultStretch: go.GraphObject.Horizontal,
            // allow drawing links from or to this port:
            fromLinkable: !this.disable,
            toLinkable: !this.disable,
            // 添加字段hover效果
            mouseEnter: this.mouseEnter,
            mouseLeave: this.mouseLeave,
          },
          new go.Binding("portId", "name"),  // this Panel is a "port"
          $(go.Shape,
            {
              desiredSize: new go.Size(10, 10),
              strokeJoin: "round",
              column: 0,
              stroke: null,
              margin: 2,
              alignment: go.Spot.Left
            },
            new go.Binding("figure", "figure"),
            new go.Binding("fill", "color"),
          ),
          //items样式
          $(go.TextBlock,
            {
              stroke: "#333333",
              column: 1,
              margin: new go.Margin(0, 2, 0, 2),
              alignment: go.Spot.Left,
              font: "13px sans-serif"
            },
            new go.Binding("text", "name")),
          $(go.TextBlock,
            {
              stroke: "#555555",
              column: 2,
              margin: new go.Margin(0, 5, 0, 2),
              alignment: go.Spot.Left,
              font: "12px sans-serif"
            },
            new go.Binding("text", "dataType")),
          $(go.TextBlock,
            {
              stroke: "#777777",
              column: 3,
              width: 70,
              wrap: go.TextBlock.None,
              overflow: go.TextBlock.OverflowEllipsis,
              margin: new go.Margin(0, 2, 0, 2),
              alignment: go.Spot.Left,
              font: "11px sans-serif"
            },
            new go.Binding("text", "comment")),
        )

      return itemTempl
    },
    mouseEnter(e, obj) {
      obj.background = '#B6D4FA'
    },
    mouseLeave(e, obj) {
      obj.background = 'transparent'
    },
    initLinkTemplate($) {
      // define the Link template, representing a relationship
      this.myDiagram.linkTemplate =
        $(go.Link, // the whole link panel
          {
            selectionAdorned: true,
            layerName: "Foreground",
            // reshapable: true,
            routing: go.Link.AvoidsNodes,
            corner: 5,
            curve: go.Link.JumpGap,
            fromEndSegmentLength: 30,
            toEndSegmentLength: 30,
            deletable: !this.disable,
            // fromSpot: go.Spot.LeftRightSides,
            // toSpot: go.Spot.LeftRightSides,
            // adjusting: go.Link.Stretch,
            // 移动连线
            // relinkableFrom: !this.disable,
            // relinkableTo: !this.disable
          },
          $(go.Shape, // the link shape
            {stroke: "#303B45", strokeWidth: 1}),
          $(go.Shape, // the link shape
            {toArrow: "OpenTriangle", fill: "#303B45"}),
          $(go.TextBlock, // the "from" label
            {
              textAlign: "center",
              font: "11px sans-serif",
              stroke: colors.drakblue,
              segmentOffset: new go.Point(0, -10),
              segmentOrientation: go.Link.OrientUpright
            },
            new go.Binding("text", "relation")),
          $(go.TextBlock, // the "to" label
            {
              textAlign: "center",
              font: "11px sans-serif",
              stroke: colors.drakblue,
              segmentOffset: new go.Point(0, 10),
              segmentOrientation: go.Link.OrientUpright
            },
            new go.Binding("text", "column")),
          {
            doubleClick: (e, obj) => {
              // 编辑关联关系
              !this.disable && (this.$refs.relateToSingleTableModal.show({table_name: obj.data.from}, obj.data, this.nodeDataArray))
            }
          },
        );
    },
    initDiagramEventListener() {
      // 监听节点移动事件
      this.myDiagram.addDiagramListener('SelectionMoved', e => {
        let movedNodes = []

        // 保存被移动节点的位置
        // for (let selection = e.diagram.selection.iterator; selection.next();) {
        //   // it.value可以拿到选中节点的Node数据
        //   if (selection.value instanceof go.Node) {
        //     movedNodes.push({
        //       id: selection.value.data.id,
        //       location: `${selection.value.location.x} ${selection.value.location.y}`
        //     })
        //   }
        // }
        //
        // this.$emit('savePosition', movedNodes)

        // 保存所有节点的位置
        this.$emit('savePosition', this.nodeDataArray)
      })

      // 监听表连接事件
      this.myDiagram.addDiagramListener("LinkDrawn", e => {
        // 增加新的关联关系

        // 如果已存在关联关系则前端无法继续建立对应关系
        let newLink = this.myDiagram.model.linkDataArray[this.myDiagram.model.linkDataArray.length - 1]

        this.$refs.relateToSingleTableModal.show({table_name: newLink.from}, newLink, this.nodeDataArray)
      })

      this.myDiagram.commandHandler.deleteSelection = () => {
        if (this.disable) {
          this.$q.ppInfo(this.operateWarning, close => close())
        } else {
          // let cmd = this.myDiagram.commandHandler

          // 用户确认后删除
          this.myDiagram.selection.each(selection => {
            let type = 'er表'
            let isTable = true
            if (selection instanceof go.Link) {
              type = 'er关系'
              isTable = false
            }

            let isDdlOptionsTable = (selection && selection.data.tag === ErTableTypeEnum.DDL_OPTIONS_TABLE.value)

            if (isDdlOptionsTable) {
              this.$q.ppErr(`表${selection.data.key}已转工单，如需删除请废弃相应建表工单`, close => close())
            } else {
              this.handleDeleteDiagramNode(selection, type, isTable)
            }
          })
        }
      }
    },
    handleDeleteDiagramNode(selection, type, isTable) {
      this.$q.ppAlert(`请确认是否要删除${selection.data.key ? `${type}--${selection.data.key}` : type}？`, close => {
        // 将节点标记为删除
        if (isTable) {
          let table = this.nodeDataArray.find(node => node.id == selection.data.id)
          table['type'] = OperateTypeEnum.DELETE.value
        } else {
          let link = this.linkDataArray.find(link => link.id == selection.data.id)
          link['type'] = OperateTypeEnum.DELETE.value
        }

        // 调用base方法删除，从界面去除
        // go.CommandHandler.prototype.deleteSelection.call(cmd)
        this.save()

        close()
      }, close => close())
    },
    /**
     * set data for ER diagram
     *
     * @param $
     */
    initDiagramData($) {
      this.myDiagram.model = new go.GraphLinksModel(this.nodeDataArray, this.linkDataArray)
      this.myDiagram.model.linkFromPortIdProperty = "fromPort"
      this.myDiagram.model.linkToPortIdProperty = "toPort"

      // this.myDiagram.model = $(go.GraphLinksModel, {
      //   // copiesArrays: true,
      //   // copiesArrayObjects: true,
      //   linkFromPortIdProperty: "fromPort",
      //   linkToPortIdProperty: "toPort",
      //   nodeDataArray: this.nodeDataArray,
      //   linkDataArray: this.linkDataArray
      // })
    },

    // 回调方法
    nodeSelectionChanged(node) {
      if (node.isSelected) {//
        // 节点选中执行的内容
        let selectedNode = this.myDiagram.model.findNodeDataForKey(node.data.key);
        this.myDiagram.model.setDataProperty(selectedNode, "fill", "#ededed");
      } else {
        //节点取消选中执行的内容
        let node1 = this.myDiagram.model.findNodeDataForKey(node.data.key);
        this.myDiagram.model.setDataProperty(node1, 'fill', "1F4963 ");
      }
    },
    // 操作
    showTableInfo(node) {
      this.$refs.tableInfoModal.show({
        cluster_id: this.rdsClusterId,
        db: this.rdsDb,
        table_name: node.key,
        is_new: node.isNew,
        id: node.id,
        tag: node.tag,
        ddl_options_id: node.ddlOptionsId
      })
    },
    // 取消链接关系
    cancelRelationLink() {
      let linkDataArray = extend(true, [], this.myDiagram.model.linkDataArray)
      linkDataArray.pop()

      this.myDiagram.model.linkDataArray = linkDataArray
      this.$emit('refresh')
    },

    // render
    // 缩略图
    renderOverview(h) {
      return h('div', {
        staticClass: 'absolute-left bg-blue-1 pp-border-3',
        attrs: {id: 'myOverviewDiv'},
        style: {width: '13vw', height: '13vh', top: '2px', left: '2px', zIndex: 300}
      },)
    },
    // 工具栏
    renderTools(h) {
      let tabIsLocked = this.tabInfo.editor_account ? true : false

      return h('div', {staticClass: 'q-mt-xs absolute-right', style: {right: '8px', zIndex: 300, height: '28px'}}, [
        // 保存 -> 改为自动保存
        // this.disable ? null : h('i', {
        //   staticClass: 'mdi mdi-content-save text-faded cursor-pointer pp-selectable-bg-blue-5 pp-selectable-color-white q-mr-md absolute-right font-26',
        //   style: {right: '174px'},
        //   on: {
        //     click: () => {
        //       this.$emit('savePosition', this.nodeDataArray)
        //     }
        //   }
        // }, [h('q-tooltip', {props: {offset: [5, 5]}}, '保存ER表位置')]),

        // 编辑锁
        this.hasRdsDbPermission ? h('i', {
          staticClass: `mdi mdi-${tabIsLocked ? 'lock' : 'lock-open-variant'} text-${tabIsLocked ? 'warning' : 'positive'} cursor-pointer pp-selectable-bg-blue-5 pp-selectable-color-white q-mr-md absolute-right font-24`,
          style: {right: '144px'},
          on: {
            click: () => {
              this.$emit('changeEditor', !tabIsLocked)
            }
          }
        }, [h('q-tooltip', {props: {offset: [5, 5]}}, `当前编辑人：${this.tabInfo.editor_account || '--'}`)]) : null,

        // 手动刷新
        h('i', {
          staticClass: 'mdi mdi-refresh text-faded cursor-pointer pp-selectable-bg-blue-5 pp-selectable-color-white q-mr-md absolute-right font-26',
          style: {right: '116px'},
          on: {
            click: () => {
              this.init()
              this.$emit('refresh')
            }
          }
        }, [h('q-tooltip', {props: {offset: [5, 5]}}, '手动刷新')]),

        // 下载为图片
        h('i', {
          staticClass: 'mdi mdi-download text-faded cursor-pointer pp-selectable-bg-blue-5 pp-selectable-color-white q-mr-md absolute-right font-26',
          style: {right: '90px'},
          on: {
            click: () => this.saveAsImage()
          }
        }, [h('q-tooltip', {props: {offset: [5, 5]}}, '保存为图片')]),

        // 搜索框
        h(LazyInput, {
          staticClass: 'pp-search-input items-center',
          props: {value: this.searchText, placeholder: '按表名定位', width: 100},
          on: {
            input: v => {
              this.searchText = v.trim()
              this.searchDiagram()
            }
          }
        }),
      ])
    },
    renderFooterRight(h) {
      return h('div', {
        staticClass: 'absolute-bottom text-right text-grey font-12 text-italic',
        style: {height: '35px', right: '8px', bottom: '0px'}
      }, [
        h('div', {}, `Author: ${this.tabInfo.creator_name} (${this.tabInfo.creator_account})`),
        h('div', {}, `Date: ${this.tabInfo.inserttime}`)
      ])
    },
    renderContextMenu(h) {
      return h('div', {
        staticClass: 'absolute',
        attrs: {id: 'Menu'},
        ref: 'contextMenu',
        style: {display: 'none', zIndex: 300}
      }, [
        h(tableNodeContextMenu, {
          props: {
            erTableInfo: this.contextNodeObj
          },
          on: {
            // relate_table: v => {
            //   this.$refs.contextMenu.style.display = 'none'
            //   this.$refs.tableERModal.show()
            // },
            view_table_info: v => {
              this.showTableInfo(this.contextNodeObj.data)
              this.$refs.contextMenu.style.display = 'none'
            },
            view_ddl_options: v => {
              this.$refs.contextMenu.style.display = 'none'

              // 打开新的页面-- ddl工单详情页
              let routeUrl = this.$router.resolve({
                path: "/audit/ddl",
                query: {id: this.contextNodeObj.data.ddlOptionsId}
              });
              window.open(routeUrl.href, '_blank');
            },
            delete_er_table: v => {
              this.handleDeleteDiagramNode(this.contextNodeObj, 'er表', true)
            }
          }
        })
      ])
    },
    // 搜索定位特定node
    searchDiagram() {
      this.myDiagram.startTransaction("highlight search");
      if (this.searchText) {
        // search four different data properties for the string, any of which may match for success
        // create a case insensitive RegExp from what the user typed
        let regex = new RegExp(this.searchText, "i");
        let results = this.myDiagram.findNodesByExample({key: regex}, {name: regex});
        this.myDiagram.highlightCollection(results);
        // try to center the diagram at the first node that was found
        if (results.count > 0) this.myDiagram.centerRect(results.first().actualBounds);
      } else {
        // empty string only clears highlighteds collection
        this.myDiagram.clearHighlighteds();
      }

      this.myDiagram.commitTransaction("highlight search");
    },
    // 保存图片
    saveAsImage() {
      let date = new Date().getTime();
      let Img = this.myDiagram.makeImage({
        scale: 1,
        background: "white"
      });
      let imgSrc = Img.src;
      let filename = date + ".png";

      let a = document.createElement("a");
      a.style = "display: none";
      a.href = imgSrc;
      a.download = filename;
      requestAnimationFrame(function () {
        a.click()
        document.body.removeChild(a)
        this.$q.ok('下载成功！')
      });
    },
    /**
     * 数据操作
     */
    handleNodeData() {
      this.nodeDataArray = this.tableList.map(table => {
        let nodeData = {
          id: table.id,
          key: table.tableName,
          ddlOptionsId: table.ddlOptionsId,
          tag: table.tag,
          isNew: table.isNew,
          tableTag: table.isNew ? '*' : null,
          // comment: table.comment,
          items: table.columns.map(column => ({
            name: column.column_name,
            dataType: column.type_name,
            comment: column.remarks,
            iskey: column.is_primary_key,
            figure: column.is_primary_key ? 'Key' : 'Diamond',
            color: column.is_primary_key ? colors.yellow : colors.lightblue,
          }))
        }

        table.position && (nodeData['location'] = table.position)

        return nodeData
      })
    },
    handleLinkData() {
      // 数据转换
      this.linkDataArray = extend(true, [], this.relationList)
    },

    // save
    save() {
      this.$emit('save', {tableList: this.nodeDataArray, relationList: this.linkDataArray})
    }
  },
  mounted() {
    this.init()
  },
  render(h) {
    return h('div', {staticClass: 'pp-border-3 fount-12', style: {outline: 'none'}}, [
      h('div', {staticClass: 'relative-position'}, [
        this.renderOverview(h),
        this.renderTools(h),
        this.renderFooterRight(h),
        h('div', {staticClass: 'full-width', attrs: {id: 'entityRelation'}, style: {minHeight: '84vh'}},),
        // h(relateToManyTableModal, {ref: 'tableERModal', on: {cancel: () => this.cancelRelationLink()}}),
        h(relateToSingleTableModal, {
          ref: 'relateToSingleTableModal', on: {
            cancel: () => this.cancelRelationLink(),
            submit: v => {
              let isUpdate = (v.id != null)
              this.linkDataArray = extend(true, [], this.myDiagram.model.linkDataArray)
              let link = isUpdate ? this.linkDataArray.find(link => link.id == v.id) : this.linkDataArray[this.linkDataArray.length - 1]
              link['type'] = isUpdate ? OperateTypeEnum.UPDATE.value : OperateTypeEnum.ADD.value

              link['relation'] = v.relationship.label
              link['fromPort'] = v.fromPort.value
              link['toPort'] = v.toPort.value
              link['column'] = `${link.fromPort} : ${link.toPort}`

              this.save()
              this.initDiagramData()
            }
          }
        }),
        h(tableInfoModal, {
          props: {disable: this.disable},
          ref: 'tableInfoModal',
        }),
        this.renderContextMenu(h)
      ])
    ])
  }
}
